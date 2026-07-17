package expo.modules.nativeocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NativeOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    // Accessible from JS via requireNativeModule('NativeOcr').
    Name("NativeOcr")

    // Recognize text in the image at `uri` using ML Kit's on-device text
    // recognizer. Resolves with { text, blocks: [{ text, lines: [{ text }] }] }
    // to stay shape-compatible with the previous ML Kit-based module.
    AsyncFunction("recognize") { uri: String, promise: Promise ->
      try {
        val context = appContext.reactContext
          ?: throw Exceptions.ReactContextLost()

        val image = InputImage.fromFilePath(context, Uri.parse(uri))
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

        recognizer.process(image)
          .addOnSuccessListener { visionText ->
            val blocks = visionText.textBlocks.map { block ->
              mapOf(
                "text" to block.text,
                "lines" to block.lines.map { line -> mapOf("text" to line.text) }
              )
            }
            promise.resolve(
              mapOf(
                "text" to visionText.text,
                "blocks" to blocks
              )
            )
          }
          .addOnFailureListener { e ->
            promise.reject("ERR_OCR", e.localizedMessage ?: "Text recognition failed", e)
          }
      } catch (e: Exception) {
        promise.reject("ERR_OCR", e.localizedMessage ?: "Text recognition failed", e)
      }
    }
  }
}
