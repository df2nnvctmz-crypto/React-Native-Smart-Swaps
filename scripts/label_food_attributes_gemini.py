#!/usr/bin/env python3
"""
Labels every food in foods.json with sensory/role/effect attributes using the
Gemini API free tier - an alternative path to the Fable-5-via-Claude-usage
pilot already validated in scripts/food_attributes/pilot_output.json.

WHY THIS SHAPE:
- Uses the EXACT schema validated in the Fable 5 pilot (163 foods, 0 schema
  violations, sensible score distributions) rather than inventing a new
  taxonomy, so this dataset is directly comparable to / mergeable with that
  one, and either can feed the same downstream ranking code.
- Preserves each food's stable `id` through every batch and validates the
  model's response contains exactly that batch's ids (order-independent)
  before accepting it. An LLM given 40 items per call can drop, duplicate,
  or reorder items; matching results back to foods by NAME (as a naive
  script might) would silently corrupt the dataset on any of those failure
  modes without ever raising an error. Matching by id and checking the id
  SET makes a corrupted batch loudly retry instead of silently mislabeling.
- Checkpoints to disk after every successful batch and skips already-labeled
  ids on restart. The free tier's small requests-per-day budget makes losing
  partial progress to a transient error expensive to redo - unlike a quick
  one-off script, a crash near the end of a multi-thousand-item run must not
  cost the whole run.
- Retries with exponential backoff on transient/validation failures instead
  of aborting the entire run on the first hiccup, and logs permanently-failed
  ids to a separate file rather than losing track of which foods still need
  labeling.
- Uses response_schema (Pydantic models) alongside response_mime_type,
  rather than relying on prompt text alone to produce valid JSON - a
  stronger guarantee against malformed output than "please return JSON".

CONFIGURE BEFORE RUNNING:
  MODEL_NAME and the RPM/RPD limits below drift as Google changes free-tier
  terms - this script's defaults are a best-effort snapshot, not a live
  source. Verify both at https://ai.google.dev/gemini-api/docs/rate-limits
  and in the Google AI Studio model picker before running.

SETUP:
  pip install google-genai pydantic python-dotenv
  Create a `.env.local` file in the repo root (already .gitignore'd via the
  existing `.env*.local` pattern - never commit it) containing one line:
      GEMINI_API_KEY=your_key_from_aistudio.google.com
  python3 scripts/label_food_attributes_gemini.py

Falls back to a plain `GEMINI_API_KEY` environment variable if no
.env.local file is present, so this also works unchanged in a shell where
you've already exported it directly.

RESUME: just re-run - ids already in the output file (or previously logged
as failed) are picked up correctly; already-labeled ids are skipped.
"""

import json
import os
import sys
import time
from pathlib import Path
from typing import Literal, Optional

from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

# Loads GEMINI_API_KEY from a repo-root .env.local if present; a no-op if the
# file doesn't exist, so an already-exported shell env var still works too.
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

# --- CONFIG: verify against https://ai.google.dev/gemini-api/docs/rate-limits ---
# History of what did NOT work, so nobody re-discovers this the hard way:
# - "gemini-2.5-flash": 404 "no longer available to new users" on
#   generateContent despite still appearing in models.list() - catalog
#   listing and per-key invoke availability can disagree.
# - "gemini-flash-latest" (an alias, seemingly safer): silently resolved to
#   "gemini-3.6-flash", the newest generation, which turned out to have only
#   a 20 REQUESTS/DAY free quota (confirmed via a live 429's quotaValue
#   field) - "latest" aliases can silently hand you a much stricter
#   introductory quota than an established generation has.
# - "gemini-2.0-flash": 429-exhausted from the very first call on this key,
#   independent of today's usage - seems to have ~zero free quota for new
#   projects regardless of generation age.
# - "gemini-3-flash-preview": looked pinned/distinct, but its 429 errors
#   explicitly report `model: gemini-3.6-flash` - Google resolves this name
#   to the SAME underlying deployment and quota bucket as the "latest"
#   alias, so it hit the identical 20/day wall. Pinning to a specific name
#   does not guarantee a specific/separate quota bucket.
# - "gemini-2.0-flash-lite": `limit: 0` in the 429 response - this project
#   has NO free quota at all for this model, not merely an exhausted one.
# "gemma-4-31b-it" (a different, non-"Gemini"-branded family) hit no quota
# wall in testing - only an occasional JSON-formatting retry, which the
# existing retry logic already absorbs. Gemma may not honor response_schema
# as strictly as Gemini's flash models (structured-output adherence is
# weaker on this family), so watch the validation-failure rate once running
# at volume - if too many batches need a retry to get valid JSON, that's a
# quality signal, not just a quota one.
MODEL_NAME = "gemma-4-31b-it"  # confirm this is still free-tier for your key/region
REQUESTS_PER_MINUTE = 10  # conservative starting point; raise only after confirming your tier's RPM
BATCH_SIZE = 40  # foods per API call
MAX_RETRIES_PER_BATCH = 5
INITIAL_BACKOFF_SECONDS = 5

SCRIPT_DIR = Path(__file__).resolve().parent
FOODS_PATH = SCRIPT_DIR.parent / "foods.json"
OUTPUT_PATH = SCRIPT_DIR / "food_attributes" / "gemini_output.json"
FAILED_IDS_PATH = SCRIPT_DIR / "food_attributes" / "gemini_failed_ids.json"

# --- Schema: identical to the validated Fable 5 pilot (pilot_output.json) ---


class Sensory(BaseModel):
    sweet: int = Field(ge=0, le=10)
    salty: int = Field(ge=0, le=10)
    sour: int = Field(ge=0, le=10)
    bitter: int = Field(ge=0, le=10)
    umami: int = Field(ge=0, le=10)
    fatty_rich: int = Field(ge=0, le=10)
    creamy: int = Field(ge=0, le=10)
    crunchy: int = Field(ge=0, le=10)


class Effect(BaseModel):
    glycemic_load: Literal["low", "medium", "high"]
    satiety: Literal["low", "medium", "high"]
    caffeine: bool
    alcohol: bool
    time_of_day: list[Literal["breakfast", "lunch", "dinner", "snack", "any"]]


class FoodAttributes(BaseModel):
    id: str
    sensory: Sensory
    culinary_role: Literal[
        "main_protein",
        "side_dish",
        "breakfast",
        "snack",
        "beverage_base",
        "condiment_seasoning",
        "dessert_sweet",
        "cooking_fat_oil",
        "soup_stew_base",
        "raw_produce",
        "baked_good",
        "base_carb",
        "dairy_staple",
    ]
    prep_state: Literal["raw", "cooked_ready_to_eat", "processed_shelf_stable", "liquid_beverage"]
    effect: Effect


SYSTEM_INSTRUCTION = """
You are labeling foods for a nutrition app's "smart swap" recommender. It
currently ranks swaps using only category taxonomy and nutrient deltas, with
no sense of taste similarity or physiological effect - this labeling pass
adds that missing signal.

For EVERY food object in the input array, produce a matching output object
with these exact fields. Copy the input "id" into the output "id" EXACTLY -
this is how results are matched back to foods, so it must not be altered,
reordered relative to input order, dropped, or invented.

sensory (0-10 integers): sweet, salty, sour, bitter, umami, fatty_rich,
  creamy, crunchy.
  Calibration: 0 = that quality is essentially absent; 5 = moderately
  present, a noticeable but secondary trait; 10 = that quality
  dominates/defines the food. Judge the food AS EATEN in its typical form
  (e.g. a cooking oil is fatty_rich=10, not judged as if diluted into a
  dish). Use the full 0-10 range - don't cluster every score near 5.

culinary_role: one of main_protein, side_dish, breakfast, snack,
  beverage_base, condiment_seasoning, dessert_sweet, cooking_fat_oil,
  soup_stew_base, raw_produce, baked_good, base_carb, dairy_staple.
  Describe how the food is actually used/eaten, not just its raw category
  string.

prep_state: one of raw, cooked_ready_to_eat, processed_shelf_stable,
  liquid_beverage. Also describes actual eaten form, not raw taxonomy.

effect:
  glycemic_load (low/medium/high): use real nutrition knowledge (e.g. white
    bread/sugar = high; leafy vegetables/pure protein/fats = low; whole
    grains/legumes = medium). Zero-carb foods like pure oils or meats are
    "low", not ambiguous or omitted.
  satiety (low/medium/high): how filling per calorie - protein, fiber,
    water content, and food form all matter (e.g. raw vegetables and lean
    protein = high; refined sugar/alcohol = low).
  caffeine (true/false), alcohol (true/false): factual.
  time_of_day: subset of breakfast, lunch, dinner, snack, any - when this
    food is typically eaten.

The food's German name (name_de) is authoritative when the English name is
an awkward or generic database translation (e.g. "Fat and offal"). Nutrient
values are context, not the source of truth for taste - use real
food/culinary knowledge first.
"""


def load_foods() -> list[dict]:
    with open(FOODS_PATH, "r", encoding="utf-8") as f:
        foods = json.load(f)
    compact = []
    for food in foods:
        n = food["nutrients_per_100"]
        compact.append(
            {
                "id": food["id"],
                "name": food["name"],
                "name_de": food.get("name_de"),
                "category": food["category"],
                "swiss_category": food["swiss_category"],
                "nutrients_per_100": {
                    "kcal": n["kcal"],
                    "sugars_g": n["sugars_g"],
                    "fat_g": n["fat_g"],
                    "protein_g": n["protein_g"],
                    "fiber_g": n["fiber_g"],
                    "salt_g": n["salt_g"],
                },
            }
        )
    return compact


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
    tmp_path.replace(OUTPUT_PATH)  # atomic on POSIX - a crash mid-write can't corrupt the real file


def prune_failed_ids(results_by_id: dict[str, dict]) -> None:
    """Drop ids from the failure log once they've succeeded on a later retry,
    so the file always reflects only foods still needing attention."""
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
    """Returns validated dicts only if the model's ids exactly match the
    batch's ids (order-independent, no duplicates) - else None so the caller
    retries instead of trusting a batch the model dropped, duplicated, or
    invented items in."""
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


def label_batch(client: genai.Client, batch: list[dict]) -> Optional[list[dict]]:
    prompt = f"Label these {len(batch)} foods:\n{json.dumps(batch)}"
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=list[FoodAttributes],
        temperature=0.2,
    )
    for attempt in range(1, MAX_RETRIES_PER_BATCH + 1):
        try:
            response = client.models.generate_content(
                model=MODEL_NAME, contents=prompt, config=config
            )
            parsed = [FoodAttributes.model_validate(item) for item in json.loads(response.text)]
            validated = validate_batch(batch, parsed)
            if validated is not None:
                return validated
            # id-set mismatch - fall through to the same retry/backoff path as any other failure
        except Exception as e:
            print(f"    attempt {attempt}/{MAX_RETRIES_PER_BATCH} error: {e}")
        if attempt < MAX_RETRIES_PER_BATCH:
            backoff = INITIAL_BACKOFF_SECONDS * (2 ** (attempt - 1))
            print(f"    retrying in {backoff}s...")
            time.sleep(backoff)
    return None


def main() -> None:
    if not os.environ.get("GEMINI_API_KEY"):
        print("Set GEMINI_API_KEY first (see the setup comment at the top of this file).")
        sys.exit(1)

    client = genai.Client()
    foods = load_foods()
    results_by_id = load_checkpoint()
    remaining = [f for f in foods if f["id"] not in results_by_id]

    print(f"{len(foods)} total foods, {len(results_by_id)} already labeled, {len(remaining)} remaining.")

    delay = 60.0 / REQUESTS_PER_MINUTE
    total_batches = (len(remaining) + BATCH_SIZE - 1) // BATCH_SIZE

    for batch_num, i in enumerate(range(0, len(remaining), BATCH_SIZE), start=1):
        batch = remaining[i : i + BATCH_SIZE]
        print(f"Batch {batch_num}/{total_batches} ({len(batch)} foods)...")

        result = label_batch(client, batch)
        if result is None:
            print(f"  giving up on this batch after {MAX_RETRIES_PER_BATCH} attempts - logging ids and continuing.")
            append_failed_ids([f["id"] for f in batch])
        else:
            for item in result:
                results_by_id[item["id"]] = item
            save_checkpoint(results_by_id)
            prune_failed_ids(results_by_id)
            print(f"  saved. {len(results_by_id)}/{len(foods)} total labeled.")

        time.sleep(delay)

    print(f"\nDone. {len(results_by_id)}/{len(foods)} labeled -> {OUTPUT_PATH}")
    if FAILED_IDS_PATH.exists() and json.load(open(FAILED_IDS_PATH)):
        print(f"Some ids still failing after retries - see {FAILED_IDS_PATH}. Re-run this script to retry them.")


if __name__ == "__main__":
    main()
