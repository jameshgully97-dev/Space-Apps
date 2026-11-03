import SwiftUI

@main
struct SkyTrackApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .task { model.start() }
                .preferredColorScheme(.dark)
        }
    }
}

struct RootView: View {
    var body: some View {
        TabView {
            CameraSkyView()
                .tabItem { Label("Sky", systemImage: "camera.viewfinder") }
            SkyMapView()
                .tabItem { Label("Sky Map", systemImage: "circle.grid.cross") }
            SatelliteListView()
                .tabItem { Label("Satellites", systemImage: "list.bullet") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}
