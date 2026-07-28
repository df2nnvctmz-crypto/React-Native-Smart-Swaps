#!/usr/bin/env python3
"""
Labels every food in foods.json with sensory/role/effect attributes using a
LOCAL model via Ollama - no API key, no rate limits, no quota, no cost.

WHY THIS SHAPE:
- Both the Fable 5 (Claude usage credits) and Gemini (Google free tier)
  paths hit real walls this session: Fable costs real usage credits at
  scale, and Gemini's free tier turned out to be far more restrictive than
  documented (every viable "flash" model name resolved to the same
  20-requests/day bucket; gemini-2.0-flash-lite had a hard `limit: 0` for
  this project). Running a model locally via Ollama sidesteps both - the
  only cost is your own machine's compute time, and there is no daily cap.
- Uses the EXACT schema validated in the Fable 5 pilot (see
  scripts/food_attributes/pilot_output.json) and shared with the (aborted)
  Gemini attempt - imported directly from label_food_attributes_gemini.py
  rather than redefined, so there is exactly one schema definition to keep
  in sync, and results stay comparable/mergeable across every labeling path
  tried this session.
- Preserves each food's stable `id` through every batch and validates the
  model's response contains exactly that batch's ids (order-independent)
  before accepting it - open-weight models are more prone to dropping or
  duplicating items in a large structured batch than frontier API models,
  so this check matters at least as much here as it did for Gemini.
- Checkpoints to disk after every successful batch and skips already-
  labeled ids on restart. Less critical than it was for the rate-limited
  API paths (nothing expires here), but a multi-hour local run should still
  survive a restart without redoing finished work.
- No RPM/RPD throttling at all - a single sequential local process is
  already the only bottleneck; the only real constraint is your machine's
  token-generation speed.

CALIBRATION NOTE: qwen3 (or whatever local model you point this at) is a
smaller/differently-trained model than Fable 5 or Gemini's flash tier -
watch the retry rate in the log. A high rate of "validation failed" retries
is a quality signal (the model struggling to follow the schema at this
batch size), not just noise - if it's high, shrink BATCH_SIZE.

SETUP:
  ollama pull qwen3:14b        # or whatever MODEL_NAME below is set to
  ollama serve                 # if not already running as a background service
  python3 scripts/label_food_attributes_ollama.py

RESUME: just re-run - ids already in the output file (or previously logged
as failed) are picked up correctly; already-labeled ids are skipped.
"""

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

from pydantic import TypeAdapter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from label_food_attributes_gemini import (  # noqa: E402
    FAILED_IDS_PATH as _UNUSED_GEMINI_FAILED_IDS_PATH,
)
from label_food_attributes_gemini import (  # noqa: E402
    OUTPUT_PATH as _UNUSED_GEMINI_OUTPUT_PATH,
)
from label_food_attributes_gemini import (  # noqa: E402
    SYSTEM_INSTRUCTION,
    FoodAttributes,
    load_foods,
)

del _UNUSED_GEMINI_FAILED_IDS_PATH, _UNUSED_GEMINI_OUTPUT_PATH  # only reusing the schema/prompt/loader, not these paths

# --- CONFIG ---
OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "qwen3:14b"
BATCH_SIZE = 25  # smaller than the API-based scripts - local generation is
                 # latency-bound by output length, not per-call overhead, and
                 # smaller batches make a truncated/malformed response cheaper
                 # to detect and retry.
MAX_RETRIES_PER_BATCH = 3
RETRY_BACKOFF_SECONDS = 3  # no rate limit to wait out locally - just enough
                           # to not hammer straight into the same failure mode
# Measured directly on this machine: a 25-item batch took ~300-330s to
# generate (11.3 tok/s, ~137 output tokens/item). The original 300s timeout
# here was tuned from an earlier, smaller test batch and sat right at that
# real generation time - it fired mid-generation on the very first full-size
# batch, killing a call that likely just needed a few more seconds, and
# would have gone on to burn all 3 retries the same way before giving up on
# a batch that was never actually broken. 900s gives ~3x real headroom.
REQUEST_TIMEOUT_SECONDS = 900

SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_PATH = SCRIPT_DIR / "food_attributes" / "ollama_output.json"
FAILED_IDS_PATH = SCRIPT_DIR / "food_attributes" / "ollama_failed_ids.json"

BATCH_SCHEMA = TypeAdapter(list[FoodAttributes]).json_schema()


def load_checkpoint() -> dict[str, dict]:
    if OUTPUT_PATH.exists():
        with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
            existing = json.load(f)
        return {item["id"]: item for item in existing}
    return {}


def save_checkpoint(results_by_id: dict[str, dict]) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = OUTPUT_PATH.with_suffix(".json.tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(list(results_by_id.values()), f, indent=1)
    tmp_path.replace(OUTPUT_PATH)  # atomic on POSIX


def prune_failed_ids(results_by_id: dict[str, dict]) -> None:
    if not FAILED_IDS_PATH.exists():
        return
    with open(FAILED_IDS_PATH, "r", encoding="utf-8") as f:
        failed = json.load(f)
    remaining_failed = sorted(set(failed) - set(results_by_id.keys()))
    with open(FAILED_IDS_PATH, "w", encoding="utf-8") as f:
        json.dump(remaining_failed, f, indent=1)


def append_failed_ids(ids: list[str]) -> None:
    existing = []
    if FAILED_IDS_PATH.exists():
        with open(FAILED_IDS_PATH, "r", encoding="utf-8") as f:
            existing = json.load(f)
    existing.extend(ids)
    FAILED_IDS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(FAILED_IDS_PATH, "w", encoding="utf-8") as f:
        json.dump(sorted(set(existing)), f, indent=1)


def validate_batch(batch: list[dict], parsed: list[FoodAttributes]) -> Optional[list[dict]]:
    """Same id-set check as the Gemini script: reject (and let the caller
    retry) a batch where the model dropped, duplicated, or invented ids,
    rather than silently trusting names/positions."""
    input_ids = {f["id"] for f in batch}
    output_ids = [item.id for item in parsed]
    if len(output_ids) != len(set(output_ids)):
        print("    validation failed: duplicate ids in response")
        return None
    if set(output_ids) != input_ids:
        missing = input_ids - set(output_ids)
        extra = set(output_ids) - input_ids
        print(f"    validation failed: missing={missing or None} extra={extra or None}")
        return None
    return [item.model_dump() for item in parsed]


def call_ollama(batch: list[dict]) -> str:
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": SYSTEM_INSTRUCTION},
            {"role": "user", "content": f"Label these {len(batch)} foods:\n{json.dumps(batch)}"},
        ],
        "format": BATCH_SCHEMA,
        "stream": False,
        "think": False,  # qwen3 is a "thinking" model by default; measured
                         # ~2.3x slower with thinking on (150s vs 64s for the
                         # same 5-item batch) with no accuracy benefit for
                         # this straightforward per-item classification task.
                         # The ~24h full-run estimate is based on this
                         # think=False timing - the actual run before this
                         # fix was NOT setting this and would have run at
                         # closer to the ~2x slower pace.
        "keep_alive": "60m",  # each batch takes ~5min; without this Ollama's
                              # default idle timeout can unload the 14GB
                              # model between calls, forcing a reload
        "options": {"temperature": 0.2},
    }
    req = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    return body["message"]["content"]


def label_batch(batch: list[dict]) -> Optional[list[dict]]:
    for attempt in range(1, MAX_RETRIES_PER_BATCH + 1):
        try:
            text = call_ollama(batch)
            parsed = [FoodAttributes.model_validate(item) for item in json.loads(text)]
            validated = validate_batch(batch, parsed)
            if validated is not None:
                return validated
        except (urllib.error.URLError, json.JSONDecodeError, Exception) as e:
            print(f"    attempt {attempt}/{MAX_RETRIES_PER_BATCH} error: {e}")
        if attempt < MAX_RETRIES_PER_BATCH:
            print(f"    retrying in {RETRY_BACKOFF_SECONDS}s...")
            time.sleep(RETRY_BACKOFF_SECONDS)
    return None


def main() -> None:
    foods = load_foods()
    results_by_id = load_checkpoint()
    remaining = [f for f in foods if f["id"] not in results_by_id]

    print(f"{len(foods)} total foods, {len(results_by_id)} already labeled, {len(remaining)} remaining.")
    print(f"model={MODEL_NAME} batch_size={BATCH_SIZE} - no rate limiting, local compute is the only bottleneck.")

    total_batches = (len(remaining) + BATCH_SIZE - 1) // BATCH_SIZE

    for batch_num, i in enumerate(range(0, len(remaining), BATCH_SIZE), start=1):
        batch = remaining[i : i + BATCH_SIZE]
        t0 = time.time()
        print(f"Batch {batch_num}/{total_batches} ({len(batch)} foods)...")

        result = label_batch(batch)
        elapsed = time.time() - t0
        if result is None:
            print(f"  giving up on this batch after {MAX_RETRIES_PER_BATCH} attempts ({elapsed:.1f}s) - logging ids and continuing.")
            append_failed_ids([f["id"] for f in batch])
        else:
            for item in result:
                results_by_id[item["id"]] = item
            save_checkpoint(results_by_id)
            prune_failed_ids(results_by_id)
            print(f"  saved ({elapsed:.1f}s). {len(results_by_id)}/{len(foods)} total labeled.")

    print(f"\nDone. {len(results_by_id)}/{len(foods)} labeled -> {OUTPUT_PATH}")
    if FAILED_IDS_PATH.exists() and json.load(open(FAILED_IDS_PATH)):
        print(f"Some ids still failing after retries - see {FAILED_IDS_PATH}. Re-run this script to retry them.")


if __name__ == "__main__":
    main()
