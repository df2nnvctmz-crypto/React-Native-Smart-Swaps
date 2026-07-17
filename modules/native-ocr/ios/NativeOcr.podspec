Pod::Spec.new do |s|
  s.name           = 'NativeOcr'
  s.version        = '1.0.0'
  s.summary        = 'Native on-device OCR using Apple Vision (iOS)'
  s.description    = 'Text recognition backed by the platform OCR engine. iOS uses Apple Vision (VNRecognizeTextRequest).'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Apple Vision is a system framework — no third-party pods needed.
  s.frameworks = 'Vision'

  s.swift_version = '5.9'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
