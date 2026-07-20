/**
 * Local, anonymized event log of real accept/reject decisions, stored in the exact
 * same feature schema as swap_training_rows.json so it can be merged into future
 * retraining runs (see scripts/trainSwapRanker.ts).
 *
 * Every row is just the numeric SwapFeatures plus a label - no food id, name, or
 * anything else that could identify the user or their diet, by construction.
 *
 * SCOPE NOTE: this only accumulates events ON THIS DEVICE. Nothing here uploads or
 * transmits anything anywhere - this project has no backend to receive it. Getting
 * these rows off the device to centrally retrain the shipped model would need a
 * deliberate decision about a collection endpoint, consent flow, and privacy
 * disclosure - the same treatment the OFF-lookup network feature got (gated behind an
 * explicit, default-off setting, with an in-app explanation of what leaves the
 * device). That's a bigger, separate decision than this file makes on its own. For
 * now, exportTrainingLog() only lets the user pull their own local data out via the
 * OS share sheet, on their own initiative.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share } from 'react-native';
import { FoodItem } from '../types';
import { extractSwapFeatures, SwapFeatures } from './swapRanker';

const STORAGE_KEY = 'swap_training_log_v1';
const MAX_ROWS = 2000; // cap local growth - oldest rows drop off first

export interface TrainingLogRow extends SwapFeatures {
  label: 'GOOD' | 'BAD';
  is_good: 0 | 1;
}

async function loadLog(): Promise<TrainingLogRow[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveLog(rows: TrainingLogRow[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-MAX_ROWS)));
  } catch {
    // Best-effort only, same reasoning as personalSwapPreferences.ts.
  }
}

/**
 * Call this alongside recordSwapAccepted/recordSwapRejected whenever a real user
 * makes a swap decision - this is the "real user accept/reject signal" the ranker's
 * training notes call out as more valuable than any more synthetic labeling.
 */
export async function logSwapDecision(
  source: FoodItem,
  candidate: FoodItem,
  accepted: boolean,
  liquidMismatch: 0 | 1,
  rawIngredientMismatch: 0 | 1
): Promise<void> {
  const features = extractSwapFeatures(source, candidate, null, liquidMismatch, rawIngredientMismatch);
  const row: TrainingLogRow = {
    ...features,
    label: accepted ? 'GOOD' : 'BAD',
    is_good: accepted ? 1 : 0,
  };
  const rows = await loadLog();
  rows.push(row);
  await saveLog(rows);
}

export async function getTrainingLogCount(): Promise<number> {
  return (await loadLog()).length;
}

/**
 * Lets the user pull their own locally-accumulated rows out via the OS share sheet
 * (email to themselves, save to files, etc). Nothing is sent automatically.
 */
export async function exportTrainingLog(): Promise<void> {
  const rows = await loadLog();
  if (rows.length === 0) {
    throw new Error('No local swap decisions recorded yet.');
  }
  await Share.share({ message: JSON.stringify(rows) });
}

export async function clearTrainingLog(): Promise<void> {
  await saveLog([]);
}
