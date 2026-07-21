/**
 * Local, on-device log of every scan line the matcher was NOT confident about - the
 * "Potential Match" and "Not Found" buckets ReceiptItemList.tsx already shows the user,
 * just persisted so they survive past the current scan.
 *
 * Exists so a future "X doesn't match right" report comes with the exact raw OCR text and
 * the matcher's actual answer already attached, instead of being reconstructed from memory
 * or screenshots. Confident matches (> CONFIDENT_THRESHOLD) aren't logged - they're not what
 * a bug report needs, and there's no reason to grow the log with lines that are working fine.
 *
 * Same privacy treatment as swapTrainingLog.ts: nothing here uploads or transmits anything;
 * exportMatchLog() only lets the user pull their own local data out via the OS share sheet,
 * on their own initiative.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share } from 'react-native';
import { ParsedReceiptItem } from '../engine/receiptParser';

const STORAGE_KEY = 'match_diagnostic_log_v1';
const MAX_ROWS = 500; // cap local growth - oldest rows drop off first

/** Mirrors ReceiptItemList.tsx's "confident" bucket cutoff (item.confidence > 0.72) - keep in sync. */
export const CONFIDENT_THRESHOLD = 0.72;

export interface MatchLogRow {
  rawText: string;
  matchedFoodId: string | null;
  matchedName: string | null;
  confidence: number;
  tier: string | null;
  timestamp: string;
}

async function loadLog(): Promise<MatchLogRow[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveLog(rows: MatchLogRow[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-MAX_ROWS)));
  } catch {
    // Best-effort only, same reasoning as swapTrainingLog.ts.
  }
}

/**
 * Call this once per completed scan (after OFF enrichment, so the log reflects the same
 * confidence/tier actually shown to the user) with the full item list. Only the weak ones
 * get appended; a scan with nothing weak is a no-op.
 */
export async function logWeakMatches(items: ParsedReceiptItem[]): Promise<void> {
  const weak = items.filter(i => !i.matchedFood || i.confidence < CONFIDENT_THRESHOLD);
  if (weak.length === 0) return;

  const timestamp = new Date().toISOString();
  const newRows: MatchLogRow[] = weak.map(item => ({
    rawText: item.rawText,
    matchedFoodId: item.matchedFood?.id ?? null,
    matchedName: item.matchedFood?.name_de ?? item.matchedFood?.name ?? null,
    confidence: item.confidence,
    tier: item.source ?? null,
    timestamp,
  }));

  const rows = await loadLog();
  await saveLog([...rows, ...newRows]);
}

export async function getMatchLogCount(): Promise<number> {
  return (await loadLog()).length;
}

/**
 * Lets the user pull their own locally-accumulated rows out via the OS share sheet
 * (email to themselves, save to files, etc). Nothing is sent automatically.
 */
export async function exportMatchLog(): Promise<void> {
  const rows = await loadLog();
  if (rows.length === 0) {
    throw new Error('No weak matches logged yet.');
  }
  await Share.share({ message: JSON.stringify(rows) });
}

export async function clearMatchLog(): Promise<void> {
  await saveLog([]);
}
