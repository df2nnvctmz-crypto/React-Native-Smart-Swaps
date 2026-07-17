import ExpoModulesCore
import Vision
import UIKit

public class NativeOcrModule: Module {
  public func definition() -> ModuleDefinition {
    // Accessible from JS via requireNativeModule('NativeOcr').
    Name("NativeOcr")

    // Recognize text in the image at `uri` using Apple's Vision framework.
    // Resolves with { text, blocks: [{ text, lines: [{ text }] }] } to stay
    // shape-compatible with the previous ML Kit-based module.
    AsyncFunction("recognize") { (uri: String, promise: Promise) in
      guard let image = NativeOcrModule.loadImage(from: uri),
            let cgImage = image.cgImage else {
        promise.reject("ERR_IMAGE", "Could not load image at \(uri)")
        return
      }

      let request = VNRecognizeTextRequest { request, error in
        if let error = error {
          promise.reject("ERR_OCR", error.localizedDescription)
          return
        }

        let observations = (request.results as? [VNRecognizedTextObservation]) ?? []

        // Vision returns observations in no guaranteed order. Receipts are read
        // top-to-bottom, so sort by vertical position (Vision's origin is
        // bottom-left, y increases upward → larger y == higher on the page),
        // then left-to-right for lines on the same row.
        let sorted = observations.sorted { a, b in
          let ay = a.boundingBox.midY
          let by = b.boundingBox.midY
          if abs(ay - by) > 0.01 {
            return ay > by
          }
          return a.boundingBox.minX < b.boundingBox.minX
        }

        let lines: [[String: Any]] = sorted.compactMap { obs in
          guard let candidate = obs.topCandidates(1).first else { return nil }
          return ["text": candidate.string]
        }

        let fullText = lines.compactMap { $0["text"] as? String }.joined(separator: "\n")
        // Group all lines into a single block (matches consumer's flatMap over blocks).
        let block: [String: Any] = ["text": fullText, "lines": lines]
        promise.resolve(["text": fullText, "blocks": [block]])
      }

      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true

      let handler = VNImageRequestHandler(
        cgImage: cgImage,
        orientation: NativeOcrModule.cgOrientation(image.imageOrientation),
        options: [:]
      )

      // Perform off the JS thread; AsyncFunction already runs off the main thread,
      // but keep OCR work on a background queue explicitly.
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try handler.perform([request])
        } catch {
          promise.reject("ERR_OCR", error.localizedDescription)
        }
      }
    }
  }

  private static func loadImage(from uri: String) -> UIImage? {
    // file:// URIs (the common case from expo-image-picker).
    if let url = URL(string: uri), url.isFileURL {
      if let data = try? Data(contentsOf: url) {
        return UIImage(data: data)
      }
    }
    // Plain filesystem path.
    if let image = UIImage(contentsOfFile: uri) {
      return image
    }
    // Fallback: any other URL scheme.
    if let url = URL(string: uri), let data = try? Data(contentsOf: url) {
      return UIImage(data: data)
    }
    return nil
  }

  private static func cgOrientation(_ orientation: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch orientation {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
