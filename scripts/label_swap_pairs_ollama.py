#!/usr/bin/env python3
"""
Step 3 of the swap-ranker plan: labels (source food -> candidate) pairs with a
LOCAL model via Ollama, producing the teacher signal a small student model is
then distilled from.

Input:  scripts/pair_slates.jsonl        (from scripts/build-pair-slates.ts)
Output: scripts/pair_labels.json         (checkpointed after every call)

WHY THIS SHAPE:

- Labels a whole SLATE per call (one source, many candidates) rather than one
  isolated pair per call. Ranking is comparative: "is Skyr a good swap for
  yoghurt" is a much harder question in isolation than "rank these 20 candidates
  for this yoghurt", and a 14B model is markedly more self-consistent when it can
  see the alternatives side by side. It also amortizes the source description
  across every candidate instead of resending it per pair.

- Emits THREE ordinal axes plus an overall verdict, not a single score. The plan's
  step 5 replaces the single collapsed score with gated taste/nutrition/effect
  axes; if this pass only recorded one number, that step would need a full
  re-label. The overall `verdict` is kept alongside them specifically so the
  result can be scored against the 216 existing human GOOD/BAD labels, which are
  binary - without it there is no way to check whether the teacher agrees with
  humans at all.

- Axes are 0-3 integers, not 0-10. The step-2 attribute pass asked this same model
  family for 0-10 sensory scores and got badly compressed output (`sour` and
  `bitter` came back as exactly 1 for ~90% of all 7,140 foods). A 4-point ordinal
  scale is within what this model tier can actually discriminate.

- The prompt deliberately OMITS the per-food `sensory` vectors that step 2
  produced, while scripts/build-pair-slates.ts still writes them into the feature
  vector. This is not an oversight. Those vectors are the weakest part of the
  attribute pass (see the compression noted above; "Yogurt -> Garlic" scores a
  sensory distance in the *closest* decile), and feeding a bad number to the
  teacher anchors it - whereas a tree model downstream can simply learn to
  discount a noisy feature. The model's own knowledge of the food NAMES is a
  better taste signal here than step 2's numbers. `culinary_role`, `prep_state`
  and the `effect` block ARE included: those parts of step 2 came out with real
  discriminative power.

- No free-text reason field. Generation speed is the only bottleneck for a local
  run, and a ~15-word reason per pair would roughly double a ~12h job to ~24h for
  something no downstream training step consumes. The plan's step 5 wants LLM
  written explanations, but those are only needed for swaps actually shown to
  users - a separate, far smaller pass over top candidates, not all 20,000 pairs.

- Long slates are split across several calls (MAX_PER_CALL) with the source
  repeated. Resending the source costs a little input, which is nearly free
  locally; a 30-item structured response from a 14B model is where id drift and
  truncation start, which costs a whole retry.

- Same durability architecture as scripts/label_food_attributes_ollama.py:
  id-set validation per call (reject and retry rather than silently mislabel),
  atomic checkpoint after every call, resume by skipping already-labeled pairs.

- Stdlib only. The step-2 scripts used pydantic for schema validation, but nothing
  in this repo's environment currently has it installed (homebrew's python is
  externally-managed, so adding it means a venv). The response schema here is
  small enough to write by hand and validate with a few range checks, so this runs
  on stock python3 with no setup at all.

SETUP:
  ollama pull qwen3:14b
  ollama serve                 # if not already running
  npx tsx scripts/build-pair-slates.ts     # produces the input
  python3 scripts/label_swap_pairs_ollama.py

RESUME: just re-run - already-labeled pair_ids are skipped.
"""

import json
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

# --- CONFIG ---
OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "qwen3:14b"
# Candidates per request.
#
# TRIED AND REJECTED: raising this to 25 on the theory that a bigger batch amortizes the
# fixed prefill (system prompt + source food) over more candidates. Measured on this
# machine, it does the opposite - cost per pair is flat to slightly WORSE as the batch
# grows, because this workload is generation-bound, not prefill-bound, and the longer
# context slows token generation:
#     batch  5 -> 5.26 s/pair
#     batch 15 -> 4.40 s/pair
#     batch 25 -> 5.29 s/pair   (19-pair calls: 5.01-5.07; a full 25 call: 5.64)
# 15 is the measured sweet spot. Re-measure before changing it rather than reasoning
# about prefill amortization, which does not describe this workload.
MAX_PER_CALL = 15
# Requests in flight at once.
#
# This was the single biggest throughput mistake in the original version, which sent one
# request and blocked until it returned. Measured on an M5 (32 GB): the model occupies
# 14 GB and generation is memory-bandwidth-bound, so a single stream leaves most of the
# GPU idle - the same reason a GPU-hosted vLLM run looks dramatically faster. It is
# batching that wins, not the hardware.
#
# The server side must agree, and by default it does NOT: `ollama ps` showed the backing
# llama-server running with `-np 1`, which serializes requests no matter how many the
# client sends. Start the server with OLLAMA_NUM_PARALLEL=4 to match this.
#
# 4 is chosen against measured prompt sizes, not guessed: real prompts are ~3.6k tokens
# with ~525 tokens of output, and llama.cpp splits its total context across slots, so a
# 32768 context at -np 4 gives 8192 per slot - roughly 2x headroom over the ~4.1k needed.
# Going to -np 8 would leave only 4096 per slot, which real p95 prompts would overrun.
CONCURRENCY = 4
# Checkpoint after this many completed requests rather than after every one. With 4 in
# flight this is about one wave, so a crash costs ~1 minute of work - and it cuts
# rewrites of pair_labels.json by 4x, which matters because every rewrite re-triggers
# Spotlight indexing of a growing file.
CHECKPOINT_EVERY = 4
MAX_RETRIES_PER_CALL = 3
RETRY_BACKOFF_SECONDS = 3
# Slates are smaller than the attribute batches (15 items x ~25 tokens of output
# vs 25 items x ~137), so this is generous headroom rather than a tight fit.
REQUEST_TIMEOUT_SECONDS = 900

SCRIPT_DIR = Path(__file__).resolve().parent
SLATES_PATH = SCRIPT_DIR / "pair_slates.jsonl"
OUTPUT_PATH = SCRIPT_DIR / "pair_labels.json"
FAILED_PATH = SCRIPT_DIR / "pair_labels_failed.json"


AXES = ("taste_fit", "nutrition_gain", "effect_fit")
VERDICTS = ("good", "marginal", "bad")

# Passed to Ollama as `format`, which constrains decoding to this shape. Note that
# constrained decoding guarantees the STRUCTURE, not the CONTENT - it cannot stop
# the model returning a pair_id that wasn't asked for, which is why validate()
# below still checks the id set independently.
BATCH_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "pair_id": {"type": "string"},
            **{ax: {"type": "integer", "minimum": 0, "maximum": 3} for ax in AXES},
            "verdict": {"type": "string", "enum": list(VERDICTS)},
        },
        "required": ["pair_id", *AXES, "verdict"],
    },
}


def parse_label(raw: object) -> dict:
    """Validate one response item. Raises ValueError on anything malformed so the
    caller's retry path handles it exactly like a transport or JSON failure."""
    if not isinstance(raw, dict):
        raise ValueError(f"expected object, got {type(raw).__name__}")
    pair_id = raw.get("pair_id")
    if not isinstance(pair_id, str) or not pair_id:
        raise ValueError(f"bad pair_id: {pair_id!r}")
    out = {"pair_id": pair_id}
    for ax in AXES:
        v = raw.get(ax)
        # bool is a subclass of int in Python; True would silently become 1.
        if isinstance(v, bool) or not isinstance(v, int) or not 0 <= v <= 3:
            raise ValueError(f"{pair_id}: {ax} must be an int 0-3, got {v!r}")
        out[ax] = v
    verdict = raw.get("verdict")
    if verdict not in VERDICTS:
        raise ValueError(f"{pair_id}: verdict must be one of {VERDICTS}, got {verdict!r}")
    out["verdict"] = verdict
    return out

SYSTEM_INSTRUCTION = """
You are rating food swaps for a nutrition app. The user bought the SOURCE food.
The app wants to suggest a healthier CANDIDATE they would actually accept in its
place. Rate every candidate in the list.

For EVERY candidate, copy its "pair_id" into your output EXACTLY as given. This
is how results are matched back, so it must not be altered, dropped, or invented.
Output one object per candidate - no more, no fewer.

Rate three INDEPENDENT axes, each an integer 0-3.

taste_fit - would this plausibly replace the source in a real meal?
  Judge by what the foods ARE, from their names and culinary role. Think about
  flavour, texture, and how the food is eaten - not nutrient numbers.
  3 = a direct substitute; you could swap it into the same meal unnoticed
      (fruit yoghurt -> skyr; white bread -> wholegrain bread)
  2 = same role, noticeably different eating experience
      (cow milk -> oat milk; beef mince -> turkey mince)
  1 = same broad occasion but not really a substitute
      (crisps -> almonds)
  0 = not a substitute at all; nobody would accept this swap
      (yoghurt -> garlic; cola -> beef broth)
  Be strict here. Most cross-category pairs are 0 even when the nutrition is
  better. A swap nobody would eat is worthless however healthy it is.

nutrition_gain - is the candidate meaningfully better nutritionally?
  Use the per-100g values given. Consider the direction that matters for THIS
  kind of food (added sugar for sweet foods and drinks, saturated fat for fats
  and meats, fibre for grains, salt for savoury foods, protein where relevant).
  3 = clearly and substantially better
  2 = moderately better
  1 = marginally better, or better in one way and worse in another
  0 = no real gain, or a net loss

effect_fit - does it do the same JOB in the day, and behave better in the body?
  Use culinary_role, prep_state, and the effect block (glycemic_load, satiety,
  caffeine, alcohol, time_of_day).
  3 = same role and time of day, and lower glycemic load or higher satiety
  2 = same role and time of day, similar physiological effect
  1 = role or timing partly mismatched
  0 = wrong role entirely (a cooking ingredient for a ready-to-eat food, a snack
      for a main, a drink for a solid), or it adds caffeine or alcohol

verdict - the overall call on whether the app should ever show this swap:
  "good"     = show it confidently. Requires taste_fit >= 2 AND nutrition_gain >= 2.
  "marginal" = defensible but not compelling; show only if nothing better exists.
  "bad"      = never show it. ANY candidate with taste_fit 0 is "bad", no matter
               how good its nutrition is.

Judge each candidate on its own merits. Do not assume the list is ordered
best-to-worst - it is not, and it usually contains some clearly bad candidates.
Do not feel obliged to spread ratings across the range: if every candidate is
bad, rate them all bad.

The German name (name_de) is authoritative when the English name reads like an
awkward database translation.
"""


def load_slates() -> list[dict]:
    if not SLATES_PATH.exists():
        print(f"Missing {SLATES_PATH}. Run: npx tsx scripts/build-pair-slates.ts")
        sys.exit(1)
    with open(SLATES_PATH, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def compact_food(view: dict, *, include_id: bool) -> dict:
    """The subset of a food the model actually reads.

    Drops `sensory` deliberately (see the module docstring) and drops the food id
    for candidates - the pair_id is the only identifier the model needs to echo,
    and offering it a second, similar-looking id is an invitation to echo the
    wrong one."""
    out = {
        "name": view["name"],
        "name_de": view["name_de"],
        "category": view["swiss_category"],
        "per100g": view["per100g"],
        "culinary_role": view["culinary_role"],
        "prep_state": view["prep_state"],
        "effect": view["effect"],
    }
    if include_id:
        out["id"] = view["id"]
    return out


def build_prompt(slate: dict, candidates: list[dict]) -> str:
    source = compact_food(slate["source"], include_id=False)
    items = [
        {"pair_id": c["pair_id"], **compact_food(c["candidate"], include_id=False)}
        for c in candidates
    ]
    return (
        f"SOURCE FOOD (what the user bought):\n{json.dumps(source, ensure_ascii=False)}\n\n"
        f"Rate these {len(items)} candidate swaps:\n{json.dumps(items, ensure_ascii=False)}"
    )


def load_checkpoint() -> dict[str, dict]:
    if OUTPUT_PATH.exists():
        with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
            return {item["pair_id"]: item for item in json.load(f)}
    return {}


def save_checkpoint(results: dict[str, dict]) -> None:
    tmp = OUTPUT_PATH.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(list(results.values()), f, indent=1)
    tmp.replace(OUTPUT_PATH)  # atomic on POSIX - a crash mid-write can't corrupt the real file


def append_failed(pair_ids: list[str]) -> None:
    existing = []
    if FAILED_PATH.exists():
        with open(FAILED_PATH, "r", encoding="utf-8") as f:
            existing = json.load(f)
    with open(FAILED_PATH, "w", encoding="utf-8") as f:
        json.dump(sorted(set(existing) | set(pair_ids)), f, indent=1)


def prune_failed(results: dict[str, dict]) -> None:
    """Drop pair_ids from the failure log once a later retry succeeded, so the
    file always lists only what still needs attention."""
    if not FAILED_PATH.exists():
        return
    with open(FAILED_PATH, "r", encoding="utf-8") as f:
        failed = json.load(f)
    with open(FAILED_PATH, "w", encoding="utf-8") as f:
        json.dump(sorted(set(failed) - set(results)), f, indent=1)


def validate(expected_ids: set[str], parsed: list[dict]) -> Optional[list[dict]]:
    """Accept only if the model's pair_ids exactly match the ones we asked about
    (order-independent, no duplicates). A 14B model given a structured list can
    drop, duplicate, or invent entries; matching results back by POSITION - as a
    naive implementation would - silently mislabels pairs on any of those failure
    modes. Comparing the id SET makes a corrupted call loudly retry instead."""
    got = [p["pair_id"] for p in parsed]
    if len(got) != len(set(got)):
        print("    validation failed: duplicate pair_ids in response")
        return None
    if set(got) != expected_ids:
        missing = expected_ids - set(got)
        extra = set(got) - expected_ids
        print(f"    validation failed: missing={len(missing)} extra={len(extra)}")
        return None
    return parsed


def call_ollama(prompt: str) -> str:
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": SYSTEM_INSTRUCTION},
            {"role": "user", "content": prompt},
        ],
        "format": BATCH_SCHEMA,
        "stream": False,
        # Same finding as the attribute run: thinking roughly doubles wall time
        # with no accuracy benefit on this kind of bounded per-item rating.
        "think": False,
        "keep_alive": "60m",  # don't let a 9GB model unload between calls
        "options": {
            "temperature": 0.2,
            # MUST be set explicitly, and MUST be small. Ollama sizes the KV cache as
            # num_ctx * OLLAMA_NUM_PARALLEL, so raising parallelism to 4 while leaving
            # the 32768 default asked for 131072 tokens of cache: measured, the model
            # went from 14 GB fully on the GPU to 31 GB split 19% CPU / 81% GPU. Partial
            # CPU offload is far slower than the single-stream run this change exists to
            # speed up, so the concurrency win would have been more than erased by the
            # memory it cost.
            #
            # 8192 is sized from measured prompts rather than guessed: real requests are
            # ~3.6k tokens in and ~525 out (p95 ~4.1k total), giving ~2x headroom, and
            # 8192 * 4 slots = 32768 - exactly the footprint the sequential run used.
            # Same memory, 4x the concurrency.
            "num_ctx": 8192,
        },
    }
    req = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
        return json.loads(resp.read().decode("utf-8"))["message"]["content"]


def label_chunk(slate: dict, candidates: list[dict]) -> Optional[list[dict]]:
    expected = {c["pair_id"] for c in candidates}
    prompt = build_prompt(slate, candidates)
    for attempt in range(1, MAX_RETRIES_PER_CALL + 1):
        try:
            text = call_ollama(prompt)
            payload = json.loads(text)
            if not isinstance(payload, list):
                raise ValueError(f"expected a JSON array, got {type(payload).__name__}")
            result = validate(expected, [parse_label(x) for x in payload])
            if result is not None:
                return result
        except Exception as e:
            print(f"    attempt {attempt}/{MAX_RETRIES_PER_CALL} error: {e}")
        if attempt < MAX_RETRIES_PER_CALL:
            time.sleep(RETRY_BACKOFF_SECONDS)
    return None


def main() -> None:
    # Python fully buffers stdout when it isn't a TTY. On a multi-hour run piped
    # to a log file or a background runner that means no visible progress at all
    # until the process exits - which looks identical to a hang.
    sys.stdout.reconfigure(line_buffering=True)

    slates = load_slates()
    results = load_checkpoint()
    total_pairs = sum(len(s["candidates"]) for s in slates)

    print(f"{len(slates)} slates, {total_pairs} pairs, {len(results)} already labeled.")
    print(f"model={MODEL_NAME} max_per_call={MAX_PER_CALL} - local compute is the only bottleneck.")

    # Flatten every outstanding chunk into one work list up front, so the pool always has
    # something to hand a free worker - a per-slate inner loop would drain to 1 in-flight
    # request at the end of each slate and waste most of the concurrency.
    work: list[tuple[dict, list[dict]]] = []
    for slate in slates:
        pending = [c for c in slate["candidates"] if c["pair_id"] not in results]
        for i in range(0, len(pending), MAX_PER_CALL):
            work.append((slate, pending[i : i + MAX_PER_CALL]))

    if not work:
        print("nothing left to label.")
    else:
        print(f"{len(work)} requests outstanding, {CONCURRENCY} in flight at a time.\n")

    # label_chunk() itself is thread-safe (it only reads module constants), so the lock
    # guards exactly the shared mutable state: the results dict and the files derived
    # from it. Every checkpoint write stays atomic and single-writer.
    lock = threading.Lock()
    completed = 0
    t_start = time.time()

    def record(slate: dict, chunk: list[dict], result: Optional[list[dict]], elapsed: float) -> None:
        nonlocal completed
        with lock:
            completed += 1
            if result is None:
                append_failed([c["pair_id"] for c in chunk])
                print(f"  [{completed}/{len(work)}] FAILED after {MAX_RETRIES_PER_CALL} attempts "
                      f"({elapsed:.1f}s) - {slate['source']['name'][:40]}")
                return
            for item in result:
                results[item["pair_id"]] = item
            if completed % CHECKPOINT_EVERY == 0 or completed == len(work):
                save_checkpoint(results)
                prune_failed(results)
            done = len(results)
            wall = time.time() - t_start
            # Rate is measured over completed REQUESTS in wall-clock time, so it already
            # reflects whatever concurrency the server is actually granting - if the
            # server is still running -np 1 this ETA will not improve, which is the
            # signal that OLLAMA_NUM_PARALLEL did not take effect.
            eta_h = (len(work) - completed) * (wall / completed) / 3600
            print(f"  [{completed}/{len(work)}] {elapsed:5.1f}s  {done}/{total_pairs} pairs  "
                  f"ETA ~{eta_h:.1f}h  [{slate['source']['name'][:36]}]")

    def timed_label(slate: dict, chunk: list[dict]) -> tuple[Optional[list[dict]], float]:
        """Times the call from when a worker actually picks it up. Timing at submit time
        instead would charge each request for however long it sat in the queue - with
        hundreds queued behind 4 workers, that reads as steadily rising latency and
        makes a healthy run look like it is degrading."""
        t0 = time.time()
        return label_chunk(slate, chunk), time.time() - t0

    try:
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
            futures = {pool.submit(timed_label, slate, chunk): (slate, chunk) for slate, chunk in work}
            for fut in as_completed(futures):
                slate, chunk = futures[fut]
                try:
                    result, elapsed = fut.result()
                except Exception as e:  # a worker raising is a bug, not a bad batch
                    print(f"  worker error: {e}")
                    result, elapsed = None, 0.0
                record(slate, chunk, result, elapsed)
    finally:
        # Ctrl-C or an unexpected exit still persists everything already labeled.
        with lock:
            save_checkpoint(results)
            prune_failed(results)

    print(f"\nDone. {len(results)}/{total_pairs} pairs labeled -> {OUTPUT_PATH}")
    if FAILED_PATH.exists() and json.load(open(FAILED_PATH)):
        print(f"Some pairs still failing - see {FAILED_PATH}. Re-run to retry them.")

    if results:
        from collections import Counter
        verdicts = Counter(r["verdict"] for r in results.values())
        print("verdict distribution:", dict(verdicts))


if __name__ == "__main__":
    main()
