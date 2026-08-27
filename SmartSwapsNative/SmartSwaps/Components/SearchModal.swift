import SwiftUI
import SmartSwapsKit

/// Port of `components/SearchModal.tsx` (24 ln) - a thin `Modal` wrapper around
/// `SearchScreen`, presented as an iOS sheet (matches `presentationStyle="pageSheet"`).
/// `SearchScreen.swift` itself is still the Phase 1 placeholder (App/../Screens); this wraps
/// whatever it becomes in Phase 5 without needing to change again.
struct SearchModal: View {
    enum Mode { case foods, swaps }

    var mode: Mode = .foods
    var onSelect: ((FoodItem) -> Void)? = nil
    var rawText: String? = nil

    var body: some View {
        SearchScreen()
    }
}
