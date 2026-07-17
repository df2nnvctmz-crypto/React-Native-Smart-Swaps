import { requireNativeModule } from 'expo-modules-core';

/**
 * A single recognized line of text.
 */
export type OcrLine = { text: string };

/**
 * A block of recognized text. On Android these map to ML Kit text blocks;
 * on iOS all recognized lines are grouped into a single block.
 */
export type OcrBlock = { text: string; lines: OcrLine[] };

/**
 * The full OCR result. Shape is intentionally compatible with
 * `@react-native-ml-kit/text-recognition` so existing consumers
 * (e.g. `result.blocks.flatMap(b => b.lines.map(l => l.text))`) work unchanged.
 */
export type OcrResult = { text: string; blocks: OcrBlock[] };

declare class NativeOcrModuleType {
  recognize(uri: string): Promise<OcrResult>;
}

const NativeOcr = requireNativeModule<NativeOcrModuleType>('NativeOcr');

/**
 * Recognize text in an image using the platform's native OCR engine:
 *  - iOS:     Apple Vision (VNRecognizeTextRequest) — on-device system framework
 *  - Android: Google ML Kit Text Recognition — on-device
 *
 * @param uri A file URI (e.g. from expo-image-picker) pointing at the image.
 */
export function recognize(uri: string): Promise<OcrResult> {
  return NativeOcr.recognize(uri);
}

export default { recognize };
