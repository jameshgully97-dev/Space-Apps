import Foundation
import Observation
import OrbitCore

/// Propagates the whole catalog and keeps a live list of satellites above the horizon.
///
/// Every ~20 s it scans the full catalog to find objects near or above the horizon;
/// every second it re-propagates just those. Each result carries an angular rate so
/// the camera overlay can animate smoothly between updates.
@MainActor
@Observable
final class SkyEngine {
    private(set) var tracked: [TrackedSatellite] = []
    private(set) var sunElevation: Double?
    private(set) var lastComputeDuration: TimeInterval = 0
    private(set) var catalogCount = 0

    private var task: Task<Void, Never>?
    private var candidateIDs: Set<Int> = []
    private var lastFullScan = Date.distantPast
    private var lastRevision = -1

    func start(catalog: CatalogService, location: @escaping @MainActor () -> GeodeticPosition?) {
        guard task == nil else { return }
        task = Task { [weak self] in
            while !Task.isCancelled {
                await self?.tick(catalog: catalog, observer: location())
                try? await Task.sleep(for: .seconds(1))
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }

    private func tick(catalog: CatalogService, observer location: GeodeticPosition?) async {
        guard let location else { return }
        let satellites = catalog.satellites
        catalogCount = satellites.count
        let now = Date()
        let fullScan = catalog.revision != lastRevision || now.timeIntervalSince(lastFullScan) > 20
        let candidates = candidateIDs
        let started = Date()

        let result = await Task.detached(priority: .userInitiated) {
            SkyEngine.compute(satellites: satellites, location: location, date: now,
                              onlyIDs: fullScan ? nil : candidates)
        }.value

        if fullScan {
            candidateIDs = result.candidates
            lastFullScan = now
            lastRevision = catalog.revision
        }
        tracked = result.tracked
        sunElevation = result.sunElevation
        lastComputeDuration = Date().timeIntervalSince(started)
    }

    private struct ComputeResult: Sendable {
        var tracked: [TrackedSatellite]
        var candidates: Set<Int>
        var sunElevation: Double
    }

    nonisolated private static func compute(satellites: [Satellite], location: GeodeticPosition, date: Date,
                                            onlyIDs: Set<Int>?) -> ComputeResult {
        let observer = Observer(location)
        let jd = date.julianDate
        let jd2 = jd + 1.0 / 86400.0
        let sun = Sun.position(jd: jd)
        let sunLook = observer.lookAngles(toTEME: sun, jd: jd)

        var tracked: [TrackedSatellite] = []
        var candidates = Set<Int>()

        for sat in satellites {
            if let onlyIDs, !onlyIDs.contains(sat.id) { continue }
            guard let state = try? sat.propagator.propagate(jd: jd) else { continue }
            let ecef = temeToECEF(state.position, jd: jd)
            let look = observer.lookAngles(toECEF: ecef)

            // Anything that could rise before the next full scan stays a candidate.
            // LEO objects move up to ~2°/s near the horizon at 20 s intervals → ~ -15°.
            if look.elevation > -15 { candidates.insert(sat.id) }
            guard look.elevation > -1 else { continue }

            var rate = Vector3.zero
            if let next = try? sat.propagator.propagate(jd: jd2) {
                rate = observer.lookAngles(toTEME: next.position, jd: jd2).enu - look.enu
            }
            tracked.append(TrackedSatellite(
                id: sat.id, name: sat.name, category: sat.category, isBright: sat.isBright,
                look: look, enuRate: rate, timestamp: date,
                subPoint: GeodeticPosition(ecef: ecef),
                speedKmS: state.velocity.length,
                isSunlit: !Sun.isEclipsed(satellite: state.position, sun: sun)))
        }
        tracked.sort { $0.look.elevation > $1.look.elevation }
        return ComputeResult(tracked: tracked, candidates: candidates, sunElevation: sunLook.elevation)
    }
}
