import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeOverrideKey } from '../engine/overrideKey';

/**
 * Per-user cache of manual corrections: normalized OCR line -> BLS food id.
 *
 * Every time the user fixes a mismatch with the edit pencil we learn that mapping, so the
 * same product resolves instantly and correctly on every later receipt. This is checked
 * before any automated matching, is fully offline, and outranks anything the matcher says.
 *
 * Corrections are kept in memory as well as persisted, because the receipt parse loop is
 * synchronous per line: call `load()` once before parsing, then `get()` freely.
 */

const OVERRIDES_KEY = '@smart_swaps_overrides';

/** Persisted shape, kept as a plain object so it serializes cleanly. */
type OverrideMap = Record<string, string>;

let cache: OverrideMap | null = null;

async function persist(map: OverrideMap): Promise<void> {
  await AsyncStorage.setItem(OVERRIDES_KEY, JSON.stringify(map));
}

export const OverrideStore = {
  /** Loads corrections into memory. Safe to call repeatedly; only reads storage once. */
  async load(): Promise<void> {
    if (cache !== null) return;
    try {
      const raw = await AsyncStorage.getItem(OVERRIDES_KEY);
      cache = raw ? (JSON.parse(raw) as OverrideMap) : {};
    } catch (e) {
      console.error('Failed to load overrides', e);
      cache = {};
    }
  },

  /**
   * Synchronous lookup of a raw OCR line. Returns the BLS food id, or null.
   * Returns null until `load()` has completed.
   */
  get(rawLine: string): string | null {
    if (cache === null) return null;
    const key = normalizeOverrideKey(rawLine);
    if (!key) return null;
    return cache[key] ?? null;
  },

  /**
   * Records (or overwrites) the correction for a raw OCR line. Re-correcting a line simply
   * calls this again with the new food id.
   */
  async set(rawLine: string, foodId: string): Promise<void> {
    const key = normalizeOverrideKey(rawLine);
    if (!key) return; // nothing distinctive left to key on
    await this.load();
    cache = { ...(cache as OverrideMap), [key]: foodId };
    try {
      await persist(cache);
    } catch (e) {
      console.error('Failed to save override', e);
    }
  },

  /** Forgets a single correction, so the matcher decides again. */
  async remove(rawLine: string): Promise<void> {
    const key = normalizeOverrideKey(rawLine);
    if (!key) return;
    await this.load();
    const next = { ...(cache as OverrideMap) };
    delete next[key];
    cache = next;
    try {
      await persist(cache);
    } catch (e) {
      console.error('Failed to remove override', e);
    }
  },

  async clear(): Promise<void> {
    cache = {};
    try {
      await AsyncStorage.removeItem(OVERRIDES_KEY);
    } catch (e) {
      console.error('Failed to clear overrides', e);
    }
  },

  /** Test seam: drops the in-memory copy so the next load() re-reads storage. */
  resetForTests(): void {
    cache = null;
  },
};
