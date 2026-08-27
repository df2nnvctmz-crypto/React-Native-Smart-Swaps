import SwiftUI

/// Placeholder for `SearchScreen.tsx` (772 ln, driven by `app/(tabs)/search.tsx`
/// with `mode="foods"`). See HomeScreen.swift.
struct SearchScreen: View {
    var body: some View {
        NavigationStack {
            Color(Colors.background)
                .ignoresSafeArea()
                .navigationTitle("Search")
        }
    }
}

#Preview {
    SearchScreen()
}
