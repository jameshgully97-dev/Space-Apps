import OrbitCore
import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var settings = model.settings

        NavigationStack {
            Form {
                Section {
                    Picker("Satellites to load", selection: $settings.source) {
                        ForEach(CatalogSource.allCases) { Text($0.title).tag($0) }
                    }
                    .onChange(of: settings.source) { model.reloadCatalog() }
                    LabeledContent("Loaded", value: "\(model.catalog.satellites.count)")
                    if let updated = model.catalog.lastUpdated {
                        LabeledContent("Updated", value: updated.formatted(.relative(presentation: .named)))
                    }
                    Button("Refresh now") { model.reloadCatalog(force: true) }
                        .disabled(model.catalog.isLoading)
                } header: {
                    Text("Catalog")
                } footer: {
                    Text("Orbital data from CelesTrak, cached on device and refreshed every few hours.")
                }

                Section("Filters") {
                    VStack(alignment: .leading) {
                        Text("Minimum elevation: \(Int(settings.minElevation))°")
                        Slider(value: $settings.minElevation, in: 0...60, step: 5)
                    }
                    Toggle("Only sunlit (can be seen by eye at night)", isOn: $settings.onlySunlit)
                    Toggle("Show names in camera view", isOn: $settings.showLabels)
                    ForEach(SatelliteCategory.allCases) { category in
                        Toggle(isOn: Binding(
                            get: { !settings.hiddenCategories.contains(category) },
                            set: { show in
                                if show { settings.hiddenCategories.remove(category) }
                                else { settings.hiddenCategories.insert(category) }
                            })) {
                            Label {
                                Text(category.title)
                            } icon: {
                                Circle().fill(category.color).frame(width: 12, height: 12)
                            }
                        }
                    }
                }

                Section {
                    VStack(alignment: .leading) {
                        Text(String(format: "Compass correction: %+.0f°", settings.headingOffset))
                        Slider(value: $settings.headingOffset, in: -30...30, step: 1)
                    }
                    Button("Reset correction") { settings.headingOffset = 0 }
                } header: {
                    Text("Camera alignment")
                } footer: {
                    Text("If the overlay is rotated relative to the real sky (e.g. the Moon or a bright star), nudge this. Wave the phone in a figure-eight to recalibrate the compass.")
                }

                Section {
                    Toggle("Use manual location", isOn: $settings.useManualLocation)
                    if settings.useManualLocation {
                        LabeledContent("Latitude") {
                            TextField("Latitude", value: $settings.manualLatitude, format: .number)
                                .keyboardType(.numbersAndPunctuation).multilineTextAlignment(.trailing)
                        }
                        LabeledContent("Longitude") {
                            TextField("Longitude", value: $settings.manualLongitude, format: .number)
                                .keyboardType(.numbersAndPunctuation).multilineTextAlignment(.trailing)
                        }
                    } else if let loc = model.location.location {
                        LabeledContent("GPS", value: String(format: "%.4f°, %.4f°", loc.latitude, loc.longitude))
                    } else if model.location.isDenied {
                        Text("Location access denied. Enable it in Settings, or enter a manual location.")
                            .foregroundStyle(.orange)
                    }
                } header: {
                    Text("Location")
                }

                Section("Diagnostics") {
                    LabeledContent("Tracked above horizon", value: "\(model.engine.tracked.count)")
                    LabeledContent("Propagation time", value: String(format: "%.0f ms", model.engine.lastComputeDuration * 1000))
                    if let sun = model.engine.sunElevation {
                        LabeledContent("Sun elevation", value: String(format: "%.1f°", sun))
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}
