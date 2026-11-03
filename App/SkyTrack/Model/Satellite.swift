import Foundation
import SwiftUI
import OrbitCore

enum SatelliteCategory: String, CaseIterable, Sendable, Identifiable {
    case station, starlink, navigation, weather, satellite, rocketBody, debris

    var id: String { rawValue }

    var title: String {
        switch self {
        case .station: "Space stations"
        case .starlink: "Starlink"
        case .navigation: "Navigation (GPS etc.)"
        case .weather: "Weather"
        case .satellite: "Other satellites"
        case .rocketBody: "Rocket bodies"
        case .debris: "Debris"
        }
    }

    var color: Color {
        switch self {
        case .station: .yellow
        case .starlink: .cyan
        case .navigation: .green
        case .weather: .orange
        case .satellite: .white
        case .rocketBody: .pink
        case .debris: .gray
        }
    }

    static func classify(name: String) -> SatelliteCategory {
        let n = name.uppercased()
        if n.contains(" DEB") || n.hasSuffix("DEB") { return .debris }
        if n.contains("R/B") { return .rocketBody }
        if n.hasPrefix("STARLINK") { return .starlink }
        if n.hasPrefix("ISS") || n.contains("ZARYA") || n.hasPrefix("CSS") || n.contains("TIANHE")
            || n.contains("TIANGONG") { return .station }
        let nav = ["GPS", "NAVSTAR", "GALILEO", "GSAT0", "GLONASS", "BEIDOU", "QZS", "IRNSS"]
        if nav.contains(where: { n.hasPrefix($0) }) { return .navigation }
        let weather = ["NOAA", "GOES", "METEOSAT", "METOP", "HIMAWARI", "FENGYUN", "FY-", "METEOR", "DMSP", "SUOMI", "JPSS"]
        if weather.contains(where: { n.hasPrefix($0) }) { return .weather }
        return .satellite
    }
}

/// A catalog entry: elements plus a ready-to-use propagator.
struct Satellite: Identifiable, Sendable {
    let id: Int
    let elements: OrbitalElements
    let propagator: SGP4
    let category: SatelliteCategory
    /// In CelesTrak's "brightest" list, so likely visible to the naked eye.
    let isBright: Bool

    var name: String { elements.name }
}

/// Live sky position of a satellite above (or near) the horizon.
struct TrackedSatellite: Identifiable, Sendable {
    let id: Int
    let name: String
    let category: SatelliteCategory
    let isBright: Bool
    let look: LookAngles
    /// Change of the ENU unit vector per second, used to animate between updates.
    let enuRate: Vector3
    let timestamp: Date
    let subPoint: GeodeticPosition
    let speedKmS: Double
    let isSunlit: Bool

    /// Interpolated unit direction (East, North, Up) at `date`.
    func enu(at date: Date) -> Vector3 {
        let dt = min(max(date.timeIntervalSince(timestamp), -2), 5)
        return (look.enu + enuRate * dt).normalized
    }
}
