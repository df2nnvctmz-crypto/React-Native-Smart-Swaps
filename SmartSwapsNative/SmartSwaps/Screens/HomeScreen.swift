import SwiftUI

/// Placeholder for `app/(tabs)/index.tsx` (415 ln). Real content lands in
/// Phase 5 of PORTING_INVENTORY.md §11 — this exists only so Phase 1's tab bar
/// has something to route to.
struct HomeScreen: View {
    var body: some View {
        NavigationStack {
            Color(Colors.background)
                .ignoresSafeArea()
                .navigationTitle("Home")
        }
    }
}

#Preview {
    HomeScreen()
}
