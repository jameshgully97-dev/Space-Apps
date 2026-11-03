import Foundation
import Observation
import OrbitCore
import SwiftUI

/// User preferences, persisted in UserDefaults.
@MainActor
@Observable
final class AppSettings {
    private let defaults = UserDefaults.standard

    var source: CatalogSource {
        didSet { defaults.set(source.rawValue, forKey: "source") }
    }
    var minElevation: Double {
        didSet { defaults.set(minElevation, forKey: "minElevation") }
    }
    var onlySunlit: Bool {
        didSet { defaults.set(onlySunlit, forKey: "onlySunlit") }
    }
    var hiddenCategories: Set<SatelliteCategory> {
        didSet { defaults.set(hiddenCategories.map(\.rawValue), forKey: "hiddenCategories") }
    }
    /// Degrees added to the compass heading to correct a misaligned overlay.
    var headingOffset: Double {
        didSet { defaults.set(headingOffset, forKey: "headingOffset") }
    }
    var useManualLocation: Bool {
        didSet { defaults.set(useManualLocation, forKey: "useManualLocation") }
    }
    var manualLatitude: Double {
        didSet { defaults.set(manualLatitude, forKey: "manualLatitude") }
    }
    var manualLongitude: Double {
        didSet { defaults.set(manualLongitude, forKey: "manualLongitude") }
    }
    var showLabels: Bool {
        didSet { defaults.set(showLabels, forKey: "showLabels") }
    }

    init() {
        source = CatalogSource(rawValue: defaults.string(forKey: "source") ?? "") ?? .active
        minElevation = defaults.object(forKey: "minElevation") as? Double ?? 0
        onlySunlit = defaults.bool(forKey: "onlySunlit")
        hiddenCategories = Set((defaults.stringArray(forKey: "hiddenCategories") ?? ["debris"])
            .compactMap(SatelliteCategory.init(rawValue:)))
        headingOffset = defaults.double(forKey: "headingOffset")
        useManualLocation = defaults.bool(forKey: "useManualLocation")
        manualLatitude = defaults.object(forKey: "manualLatitude") as? Double ?? 51.4779
        manualLongitude = defaults.object(forKey: "manualLongitude") as? Double ?? -0.0015
        showLabels = defaults.object(forKey: "showLabels") as? Bool ?? true
    }
}

/// Top-level container shared through the SwiftUI environment.
@MainActor
@Observable
final class AppModel {
    let settings = AppSettings()
    let catalog = CatalogService()
    let location = LocationService()
    let engine = SkyEngine()
    let camera = CameraService()
    @ObservationIgnored let motion = MotionService()

    var selectedID: Int?

    var observerLocation: GeodeticPosition? {
        if settings.useManualLocation {
            return GeodeticPosition(latitude: settings.manualLatitude, longitude: settings.manualLongitude, altitude: 0)
        }
        return location.location
    }

    /// Satellites currently above the horizon after applying the user's filters.
    var visibleSatellites: [TrackedSatellite] {
        engine.tracked.filter { sat in
            sat.look.elevation >= settings.minElevation
                && !settings.hiddenCategories.contains(sat.category)
                && (!settings.onlySunlit || sat.isSunlit)
        }
    }

    var selected: TrackedSatellite? {
        guard let selectedID else { return nil }
        return engine.tracked.first { $0.id == selectedID }
    }

    func satellite(id: Int) -> Satellite? {
        catalog.satellites.first { $0.id == id }
    }

    /// True when it's dark enough for sunlit satellites to be seen by eye.
    var isDarkSky: Bool { (engine.sunElevation ?? 0) < -6 }

    func start() {
        location.start()
        engine.start(catalog: catalog) { [weak self] in self?.observerLocation }
        Task { await catalog.load(source: settings.source) }
    }

    func reloadCatalog(force: Bool = false) {
        Task { await catalog.load(source: settings.source, forceRefresh: force) }
    }
}
