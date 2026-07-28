/**
 * On-device lookup for the sensory / culinary-role / physiological-effect labels
 * produced by the offline attribute-labeling pass (scripts/label_food_attributes_ollama.py),
 * packed by scripts/build-food-attributes-asset.ts.
 *
 * These are not decorative. Ablating the seven features derived from this data costs the
 * swap ranker 12.5 points of balanced accuracy and 9.9 points of AUC under grouped
 * cross-validation, so this asset is load-bearing for ranking quality.
 *
 * COST: 210 KB base64 (from 2.8 MB of raw JSON), decoded once, lazily, into a Uint8Array
 * on first lookup. Each read is a handful of array indexes - the same lazy-decode shape
 * foodEmbeddings.ts uses for the int8 vectors.
 *
 * KNOWN LIMITATION: these labels come from a 14B local model, and the sensory axes in
 * particular came back compressed - `sour` and `bitter` are exactly 1 for roughly 90% of
 * all 7,140 foods, and 201 foods share an all-1s vector. Treat individual sensory values
 * as weak evidence. The categorical fields (culinary_role, prep_state) and the effect
 * block held up much better and carry most of the signal.
 */

import assetData from './foodAttributes.data.json';

interface AttributeAsset {
  count: number;
  bytesPerFood: number;
  roles: string[];
  prep: string[];
  levels: string[];
  times: string[];
  sensoryAxes: string[];
  ids: string[];
  q: string;
}

const asset = assetData as AttributeAsset;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP: Int16Array = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

// Hermes/RN guarantees neither atob nor Buffer, same reason foodEmbeddings.ts hand-rolls this.
function base64ToUint8Array(b64: string): Uint8Array {
  const len = b64.length;
  let padding = 0;
  if (len > 0 && b64[len - 1] === '=') padding++;
  if (len > 1 && b64[len - 2] === '=') padding++;
  const byteLength = (len / 4) * 3 - padding;
  const bytes = new Uint8Array(byteLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e0 = B64_LOOKUP[b64.charCodeAt(i)];
    const e1 = B64_LOOKUP[b64.charCodeAt(i + 1)];
    const e2 = B64_LOOKUP[b64.charCodeAt(i + 2)];
    const e3 = B64_LOOKUP[b64.charCodeAt(i + 3)];
    const chunk = (e0 << 18) | (e1 << 12) | ((e2 & 63) << 6) | (e3 & 63);
    if (p < byteLength) bytes[p++] = (chunk >> 16) & 0xff;
    if (p < byteLength) bytes[p++] = (chunk >> 8) & 0xff;
    if (p < byteLength) bytes[p++] = chunk & 0xff;
  }
  return bytes;
}

let raw: Uint8Array | null = null;
let idIndex: Map<string, number> | null = null;

function ensureLoaded(): void {
  if (raw !== null) return;
  raw = base64ToUint8Array(asset.q);
  idIndex = new Map();
  for (let i = 0; i < asset.ids.length; i++) idIndex.set(asset.ids[i], i);
}

export interface FoodAttributes {
  sensory: number[];        // 8 axes, order = asset.sensoryAxes, each 0-10
  culinaryRole: number;     // index into asset.roles, or -1 if unknown
  prepState: number;        // index into asset.prep, or -1 if unknown
  glycemicLoad: number;     // 0=low 1=medium 2=high
  satiety: number;          // 0=low 1=medium 2=high
  caffeine: boolean;
  alcohol: boolean;
  timeOfDayMask: number;    // bitmask over asset.times
}

/**
 * Attributes for a food id, or null if we have none.
 *
 * Null is deliberate and must be propagated, not defaulted. The GBM was trained with
 * missing values as a first-class case (each split carries a learned default direction),
 * so a genuinely unknown food degrades gracefully - whereas substituting zeros would
 * assert "no sweetness, no saltiness, raw produce", which is a confident lie.
 */
export function getAttributes(id: string): FoodAttributes | null {
  ensureLoaded();
  const idx = idIndex!.get(id);
  if (idx === undefined) return null;
  const o = idx * asset.bytesPerFood;
  const b = raw!;
  const sensory: number[] = [];
  for (let k = 0; k < 8; k++) sensory.push(b[o + k]);
  return {
    sensory,
    culinaryRole: b[o + 8] === 255 ? -1 : b[o + 8],
    prepState: b[o + 9] === 255 ? -1 : b[o + 9],
    glycemicLoad: b[o + 10],
    satiety: b[o + 11],
    caffeine: b[o + 12] === 1,
    alcohol: b[o + 13] === 1,
    timeOfDayMask: b[o + 14],
  };
}

export function hasAttributes(id: string): boolean {
  ensureLoaded();
  return idIndex!.has(id);
}

export const TIME_LABELS = asset.times;
export const ROLE_LABELS = asset.roles;
export const PREP_LABELS = asset.prep;
export const SENSORY_AXES = asset.sensoryAxes;
