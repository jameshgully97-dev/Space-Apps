import OrbitCore
import SwiftUI

struct SatelliteListView: View {
    @Environment(AppModel.self) private var model
    @State private var search = ""
    @State private var scope: Scope = .overhead

    enum Scope: String, CaseIterable { case overhead = "Overhead now", catalog = "Whole catalog" }

    var body: some View {
        NavigationStack {
            List {
                Picker("Show", selection: $scope) {
                    ForEach(Scope.allCases, id: \.self) { Text($0.rawValue) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)

                switch scope {
                case .overhead: overheadRows
                case .catalog: catalogRows
                }
            }
            .searchable(text: $search, prompt: "Name or NORAD number")
            .navigationTitle("Satellites")
            .navigationDestination(for: Int.self) { id in SatelliteDetailView(satelliteID: id) }
            .refreshable { model.reloadCatalog(force: true) }
            .overlay {
                if model.catalog.satellites.isEmpty {
                    if model.catalog.isLoading {
                        ProgressView("Downloading satellite catalog…")
                    } else if let error = model.catalog.errorMessage {
                        ContentUnavailableView("Catalog unavailable", systemImage: "wifi.exclamationmark",
                                               description: Text(error))
                    }
                }
            }
        }
    }

    private func matches(_ name: String, _ id: Int) -> Bool {
        search.isEmpty || name.localizedCaseInsensitiveContains(search) || String(id).hasPrefix(search)
    }

    @ViewBuilder private var overheadRows: some View {
        let sats = model.visibleSatellites.filter { matches($0.name, $0.id) }
        Section("\(sats.count) above \(Int(model.settings.minElevation))°") {
            ForEach(sats) { sat in
                NavigationLink(value: sat.id) {
                    HStack {
                        Circle().fill(sat.category.color).frame(width: 10, height: 10)
                        VStack(alignment: .leading) {
                            Text(sat.name).font(.body.weight(.medium))
                            Text(String(format: "Alt %.0f km · %@", sat.subPoint.altitude,
                                        sat.isSunlit ? "sunlit" : "in shadow"))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing) {
                            Text(String(format: "El %.0f°", sat.look.elevation))
                            Text(String(format: "Az %.0f°", sat.look.azimuth)).foregroundStyle(.secondary)
                        }
                        .font(.caption.monospacedDigit())
                    }
                }
            }
        }
    }

    @ViewBuilder private var catalogRows: some View {
        let all = model.catalog.satellites
        let filtered = search.isEmpty ? Array(all.prefix(300)) : all.filter { matches($0.name, $0.id) }.prefix(300).map { $0 }
        Section(search.isEmpty ? "\(all.count) in catalog (first 300 shown — search to find more)" : "\(filtered.count) matches") {
            ForEach(filtered) { sat in
                NavigationLink(value: sat.id) {
                    HStack {
                        Circle().fill(sat.category.color).frame(width: 10, height: 10)
                        VStack(alignment: .leading) {
                            Text(sat.name)
                            Text("NORAD \(sat.id) · \(sat.elements.internationalDesignator)")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }
}
