import Foundation
import Observation
import OrbitCore

/// Which CelesTrak GP group to load as the main catalog.
enum CatalogSource: String, CaseIterable, Identifiable, Sendable {
    case active
    case visual
    case stations
    case starlink
    case gnss
    case weather
    case geo
    case last30Days = "last-30-days"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .active: "All active satellites (~10,000+)"
        case .visual: "Brightest (naked eye)"
        case .stations: "Space stations"
        case .starlink: "Starlink"
        case .gnss: "Navigation (GNSS)"
        case .weather: "Weather"
        case .geo: "Geostationary"
        case .last30Days: "Launched in last 30 days"
        }
    }

    var url: URL {
        URL(string: "https://celestrak.org/NORAD/elements/gp.php?GROUP=\(rawValue)&FORMAT=json")!
    }
}

/// Downloads, caches and parses satellite element sets from CelesTrak.
@MainActor
@Observable
final class CatalogService {
    private(set) var satellites: [Satellite] = []
    private(set) var isLoading = false
    private(set) var lastUpdated: Date?
    private(set) var errorMessage: String?
    /// Bumped whenever `satellites` is replaced.
    private(set) var revision = 0

    /// CelesTrak updates GP data every few hours and asks clients not to poll more often.
    private let maxAge: TimeInterval = 4 * 3600

    func load(source: CatalogSource, forceRefresh: Bool = false) async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            async let main = Self.fetch(source, maxAge: forceRefresh ? 0 : maxAge)
            // Small extra groups used to tag stations and naked-eye-bright objects.
            async let stations = try? Self.fetch(.stations, maxAge: maxAge)
            async let bright = try? Self.fetch(.visual, maxAge: maxAge)

            let (mainResult, stationResult, brightResult) = try await (main, stations, bright)
            let stationIDs = Set(stationResult?.elements.map(\.noradID) ?? [])
            let brightIDs = Set(brightResult?.elements.map(\.noradID) ?? [])

            let built = await Task.detached(priority: .userInitiated) {
                Self.buildSatellites(mainResult.elements, stationIDs: stationIDs, brightIDs: brightIDs)
            }.value

            satellites = built
            lastUpdated = mainResult.fetchedAt
            revision += 1
        } catch {
            errorMessage = "Could not load satellites: \(error.localizedDescription)"
        }
    }

    nonisolated private static func buildSatellites(_ elements: [OrbitalElements], stationIDs: Set<Int>,
                                                    brightIDs: Set<Int>) -> [Satellite] {
        var seen = Set<Int>()
        var result: [Satellite] = []
        result.reserveCapacity(elements.count)
        for el in elements where seen.insert(el.noradID).inserted {
            guard let sgp4 = try? SGP4(elements: el) else { continue }
            var category = SatelliteCategory.classify(name: el.name)
            if stationIDs.contains(el.noradID) && category == .satellite { category = .station }
            result.append(Satellite(id: el.noradID, elements: el, propagator: sgp4, category: category,
                                    isBright: brightIDs.contains(el.noradID)))
        }
        return result
    }

    // MARK: - Network + disk cache

    private struct FetchResult: Sendable {
        let elements: [OrbitalElements]
        let fetchedAt: Date
    }

    nonisolated private static func cacheURL(for source: CatalogSource) -> URL {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("celestrak-\(source.rawValue).json")
    }

    nonisolated private static func fetch(_ source: CatalogSource, maxAge: TimeInterval) async throws -> FetchResult {
        let cache = cacheURL(for: source)
        let attrs = try? FileManager.default.attributesOfItem(atPath: cache.path)
        let cachedAt = attrs?[.modificationDate] as? Date

        if let cachedAt, Date().timeIntervalSince(cachedAt) < maxAge,
           let data = try? Data(contentsOf: cache),
           let elements = try? OrbitalElements.decodeCelesTrakJSON(data), !elements.isEmpty {
            return FetchResult(elements: elements, fetchedAt: cachedAt)
        }

        do {
            var request = URLRequest(url: source.url)
            request.timeoutInterval = 60
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                throw URLError(.badServerResponse)
            }
            let elements = try OrbitalElements.decodeCelesTrakJSON(data)
            guard !elements.isEmpty else { throw URLError(.cannotParseResponse) }
            try? data.write(to: cache, options: .atomic)
            return FetchResult(elements: elements, fetchedAt: Date())
        } catch {
            // Offline: fall back to any cached copy, however old.
            if let data = try? Data(contentsOf: cache),
               let elements = try? OrbitalElements.decodeCelesTrakJSON(data), !elements.isEmpty {
                return FetchResult(elements: elements, fetchedAt: cachedAt ?? .distantPast)
            }
            throw error
        }
    }
}
