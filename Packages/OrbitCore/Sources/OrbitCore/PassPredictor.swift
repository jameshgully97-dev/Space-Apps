import Foundation

/// Sky position of one satellite at one instant, as seen by an observer.
public struct SkyPosition: Sendable, Hashable {
    public var look: LookAngles
    public var subPoint: GeodeticPosition
    /// True when the satellite is in sunlight.
    public var isSunlit: Bool
    /// km/s, magnitude of the TEME velocity.
    public var speed: Double
}

extension SGP4 {
    /// Computes where the satellite is in the observer's sky at `jd`.
    public func skyPosition(jd: Double, observer: Observer, sun: Vector3? = nil) throws -> SkyPosition {
        let state = try propagate(jd: jd)
        let ecef = temeToECEF(state.position, jd: jd)
        let look = observer.lookAngles(toECEF: ecef)
        let sunPos = sun ?? Sun.position(jd: jd)
        return SkyPosition(look: look,
                           subPoint: GeodeticPosition(ecef: ecef),
                           isSunlit: !Sun.isEclipsed(satellite: state.position, sun: sunPos),
                           speed: state.velocity.length)
    }

    /// Elevation (degrees) at `jd`, or nil if propagation fails.
    public func elevation(jd: Double, observer: Observer) -> Double? {
        guard let state = try? propagate(jd: jd) else { return nil }
        return observer.lookAngles(toTEME: state.position, jd: jd).elevation
    }
}

/// A pass of a satellite over an observer.
public struct Pass: Sendable, Hashable {
    public var rise: Date
    public var culmination: Date
    public var set: Date
    public var maxElevation: Double
    public var riseAzimuth: Double
    public var setAzimuth: Double
}

public enum PassPredictor {
    /// Finds passes above `minElevation` between `start` and `start + hours`.
    public static func passes(for sat: SGP4, observer: Observer, from start: Date, hours: Double = 24,
                              minElevation: Double = 10, limit: Int = 10) -> [Pass] {
        let startJD = start.julianDate
        let endJD = startJD + hours / 24.0
        // Coarse step: ~1/60 of an orbit, between 20 s and 5 min.
        let stepDays = min(max(sat.elements.periodMinutes / 60.0, 1.0 / 3.0), 5.0) / 1440.0

        func el(_ jd: Double) -> Double { sat.elevation(jd: jd, observer: observer) ?? -90 }

        /// Bisects for the horizon crossing between a (below) and b (above) or vice versa.
        func crossing(_ a: Double, _ b: Double) -> Double {
            var lo = a, hi = b
            let rising = el(a) < 0
            for _ in 0..<30 {
                let mid = (lo + hi) / 2
                if (el(mid) >= 0) == rising { hi = mid } else { lo = mid }
            }
            return (lo + hi) / 2
        }

        var result: [Pass] = []
        var jd = startJD
        var prev = el(jd)
        var riseJD: Double? = prev >= 0 ? startJD : nil

        while jd < endJD, result.count < limit {
            let next = jd + stepDays
            let e = el(next)
            if prev < 0, e >= 0 {
                riseJD = crossing(jd, next)
            } else if prev >= 0, e < 0, let r = riseJD {
                let s = crossing(jd, next)
                if let pass = makePass(sat: sat, observer: observer, rise: r, set: s, minElevation: minElevation) {
                    result.append(pass)
                }
                riseJD = nil
            }
            prev = e
            jd = next
        }
        return result
    }

    private static func makePass(sat: SGP4, observer: Observer, rise: Double, set: Double,
                                 minElevation: Double) -> Pass? {
        // Golden-section search for the culmination.
        var a = rise, b = set
        let gr = (5.0.squareRoot() - 1) / 2
        func el(_ jd: Double) -> Double { sat.elevation(jd: jd, observer: observer) ?? -90 }
        for _ in 0..<40 {
            let c = b - gr * (b - a), d = a + gr * (b - a)
            if el(c) > el(d) { b = d } else { a = c }
        }
        let top = (a + b) / 2
        let maxEl = el(top)
        guard maxEl >= minElevation,
              let r = try? sat.propagate(jd: rise), let s = try? sat.propagate(jd: set) else { return nil }
        return Pass(rise: Date(julianDate: rise),
                    culmination: Date(julianDate: top),
                    set: Date(julianDate: set),
                    maxElevation: maxEl,
                    riseAzimuth: observer.lookAngles(toTEME: r.position, jd: rise).azimuth,
                    setAzimuth: observer.lookAngles(toTEME: s.position, jd: set).azimuth)
    }
}
