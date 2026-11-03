import MapKit
import OrbitCore
import SwiftUI

struct SatelliteDetailView: View {
    let satelliteID: Int
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var passes: [Pass] = []
    @State private var loadingPasses = true
    @State private var now = Date()

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        Group {
            if let sat = model.satellite(id: satelliteID) {
                content(sat)
            } else {
                ContentUnavailableView("Satellite not in catalog", systemImage: "questionmark.circle")
            }
        }
        .onReceive(timer) { now = $0 }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Track") {
                    model.selectedID = satelliteID
                    dismiss()
                }
            }
        }
    }

    @ViewBuilder
    private func content(_ sat: Satellite) -> some View {
        let observer = model.observerLocation.map(Observer.init)
        let position = observer.flatMap { try? sat.propagator.skyPosition(jd: now.julianDate, observer: $0) }

        List {
            if let position {
                Section("Right now") {
                    row("Azimuth", String(format: "%.1f° (%@)", position.look.azimuth, compass(position.look.azimuth)))
                    row("Elevation", String(format: "%.1f°%@", position.look.elevation,
                                            position.look.elevation < 0 ? " — below horizon" : ""))
                    row("Range", String(format: "%.0f km", position.look.range))
                    row("Altitude", String(format: "%.0f km", position.subPoint.altitude))
                    row("Speed", String(format: "%.2f km/s", position.speed))
                    row("Illumination", position.isSunlit ? "In sunlight" : "In Earth's shadow")
                    row("Over", String(format: "%.2f°, %.2f°", position.subPoint.latitude, position.subPoint.longitude))
                }

                Section {
                    let coord = CLLocationCoordinate2D(latitude: position.subPoint.latitude,
                                                       longitude: position.subPoint.longitude)
                    Map(position: .constant(.camera(MapCamera(centerCoordinate: coord, distance: 8_000_000)))) {
                        Marker(sat.name, systemImage: "antenna.radiowaves.left.and.right", coordinate: coord)
                            .tint(.green)
                        if let obs = model.observerLocation {
                            Marker("You", systemImage: "person.fill",
                                   coordinate: CLLocationCoordinate2D(latitude: obs.latitude, longitude: obs.longitude))
                        }
                    }
                    .frame(height: 220)
                    .listRowInsets(EdgeInsets())
                }
            } else {
                Section { Text("Waiting for your location…").foregroundStyle(.secondary) }
            }

            Section("Upcoming passes (next 48 h, above 10°)") {
                if loadingPasses {
                    ProgressView()
                } else if passes.isEmpty {
                    Text("No passes found").foregroundStyle(.secondary)
                } else {
                    ForEach(passes, id: \.rise) { pass in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(pass.rise.formatted(date: .abbreviated, time: .shortened)).font(.headline)
                            Text(String(format: "Max %.0f° · rises %@ · sets %@ · %d min",
                                        pass.maxElevation, compass(pass.riseAzimuth), compass(pass.setAzimuth),
                                        Int(pass.set.timeIntervalSince(pass.rise) / 60)))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section("Orbit") {
                let el = sat.elements
                row("NORAD ID", "\(sat.id)")
                row("Int'l designator", el.internationalDesignator)
                row("Category", sat.category.title)
                row("Period", String(format: "%.1f min", el.periodMinutes))
                row("Inclination", String(format: "%.2f°", el.inclination))
                row("Eccentricity", String(format: "%.5f", el.eccentricity))
                row("Elements epoch", el.epoch.formatted(date: .abbreviated, time: .shortened))
            }
        }
        .navigationTitle(sat.name)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: satelliteID) {
            guard let observer else { loadingPasses = false; return }
            let propagator = sat.propagator
            let found = await Task.detached(priority: .userInitiated) {
                PassPredictor.passes(for: propagator, observer: observer, from: Date(), hours: 48, minElevation: 10)
            }.value
            passes = found
            loadingPasses = false
        }
    }

    private func row(_ title: String, _ value: String) -> some View {
        LabeledContent(title, value: value).font(.subheadline.monospacedDigit())
    }

    private func compass(_ az: Double) -> String {
        let names = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
        return names[Int((az + 11.25) / 22.5) % 16]
    }
}
