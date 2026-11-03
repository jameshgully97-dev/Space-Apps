import Foundation

// MARK: - Vectors

public struct Vector3: Sendable, Hashable, Codable {
    public var x: Double
    public var y: Double
    public var z: Double

    public init(_ x: Double, _ y: Double, _ z: Double) {
        self.x = x; self.y = y; self.z = z
    }

    public static let zero = Vector3(0, 0, 0)

    public var length: Double { (x * x + y * y + z * z).squareRoot() }
    public var normalized: Vector3 { let l = length; return l > 0 ? self / l : self }
    public func dot(_ o: Vector3) -> Double { x * o.x + y * o.y + z * o.z }
    public func cross(_ o: Vector3) -> Vector3 {
        Vector3(y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x)
    }
    public static func + (a: Vector3, b: Vector3) -> Vector3 { Vector3(a.x + b.x, a.y + b.y, a.z + b.z) }
    public static func - (a: Vector3, b: Vector3) -> Vector3 { Vector3(a.x - b.x, a.y - b.y, a.z - b.z) }
    public static func * (a: Vector3, s: Double) -> Vector3 { Vector3(a.x * s, a.y * s, a.z * s) }
    public static func / (a: Vector3, s: Double) -> Vector3 { Vector3(a.x / s, a.y / s, a.z / s) }
}

// MARK: - Time

public enum JulianDate {
    public static let unixEpochJD = 2440587.5

    /// Julian date of a Gregorian calendar date/time (UTC).
    public static func from(year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Double) -> Double {
        // Vallado, "jday" (valid 1900-2100).
        let y = Double(year), m = Double(month), d = Double(day)
        let jd = 367.0 * y
            - floor(7.0 * (y + floor((m + 9.0) / 12.0)) * 0.25)
            + floor(275.0 * m / 9.0)
            + d + 1721013.5
        return jd + (Double(hour) * 3600.0 + Double(minute) * 60.0 + second) / 86400.0
    }

    /// Parses "2025-11-03T05:12:34.123456" (UTC, optional trailing Z).
    public static func parseISO8601UTC(_ s: String) -> Double? {
        var str = s.trimmingCharacters(in: .whitespaces)
        if str.hasSuffix("Z") { str.removeLast() }
        let parts = str.split(separator: "T")
        guard parts.count == 2 else { return nil }
        let date = parts[0].split(separator: "-")
        let time = parts[1].split(separator: ":")
        guard date.count == 3, time.count >= 2,
              let y = Int(date[0]), let mo = Int(date[1]), let d = Int(date[2]),
              let h = Int(time[0]), let mi = Int(time[1]) else { return nil }
        let sec = time.count > 2 ? (Double(time[2]) ?? 0) : 0
        return from(year: y, month: mo, day: d, hour: h, minute: mi, second: sec)
    }

    /// Greenwich mean sidereal time (radians), IAU-82 as used by SGP4.
    public static func gmst(_ jdut1: Double) -> Double {
        let tut1 = (jdut1 - 2451545.0) / 36525.0
        var temp = -6.2e-6 * tut1 * tut1 * tut1 + 0.093104 * tut1 * tut1
            + (876600.0 * 3600 + 8640184.812866) * tut1 + 67310.54841
        temp = fmod(temp * (.pi / 180.0) / 240.0, 2 * .pi)
        if temp < 0 { temp += 2 * .pi }
        return temp
    }
}

extension Date {
    public init(julianDate jd: Double) {
        self.init(timeIntervalSince1970: (jd - JulianDate.unixEpochJD) * 86400.0)
    }

    public var julianDate: Double {
        timeIntervalSince1970 / 86400.0 + JulianDate.unixEpochJD
    }
}

// MARK: - Earth & observer

public enum WGS84 {
    public static let a = 6378.137 // km
    public static let f = 1.0 / 298.257223563
    public static let e2 = f * (2 - f)
}

/// Geodetic position on the Earth.
public struct GeodeticPosition: Sendable, Hashable, Codable {
    /// Degrees, north positive.
    public var latitude: Double
    /// Degrees, east positive.
    public var longitude: Double
    /// Kilometres above the WGS84 ellipsoid.
    public var altitude: Double

    public init(latitude: Double, longitude: Double, altitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
        self.altitude = altitude
    }

    /// Earth-centred, Earth-fixed position in km.
    public var ecef: Vector3 {
        let lat = latitude * .pi / 180, lon = longitude * .pi / 180
        let sinLat = sin(lat)
        let n = WGS84.a / (1 - WGS84.e2 * sinLat * sinLat).squareRoot()
        return Vector3((n + altitude) * cos(lat) * cos(lon),
                       (n + altitude) * cos(lat) * sin(lon),
                       (n * (1 - WGS84.e2) + altitude) * sinLat)
    }

    public init(ecef r: Vector3) {
        let lon = atan2(r.y, r.x)
        let p = (r.x * r.x + r.y * r.y).squareRoot()
        var lat = atan2(r.z, p * (1 - WGS84.e2))
        var h = 0.0
        for _ in 0..<6 {
            let sinLat = sin(lat)
            let n = WGS84.a / (1 - WGS84.e2 * sinLat * sinLat).squareRoot()
            h = abs(cos(lat)) > 1e-9 ? p / cos(lat) - n : abs(r.z) - n * (1 - WGS84.e2)
            lat = atan2(r.z, p * (1 - WGS84.e2 * n / (n + h)))
        }
        self.init(latitude: lat * 180 / .pi, longitude: lon * 180 / .pi, altitude: h)
    }
}

/// Rotates a TEME vector into ECEF (polar motion neglected).
public func temeToECEF(_ r: Vector3, jd: Double) -> Vector3 {
    let g = JulianDate.gmst(jd)
    let c = cos(g), s = sin(g)
    return Vector3(c * r.x + s * r.y, -s * r.x + c * r.y, r.z)
}

/// Where a satellite appears in the sky of an observer.
public struct LookAngles: Sendable, Hashable {
    /// Degrees clockwise from true north, 0..<360.
    public var azimuth: Double
    /// Degrees above the horizon.
    public var elevation: Double
    /// Kilometres.
    public var range: Double
    /// Unit vector in the local East-North-Up frame.
    public var enu: Vector3
}

public struct Observer: Sendable, Hashable {
    public let location: GeodeticPosition
    public let ecef: Vector3
    private let sinLat, cosLat, sinLon, cosLon: Double

    public init(_ location: GeodeticPosition) {
        self.location = location
        self.ecef = location.ecef
        let lat = location.latitude * .pi / 180, lon = location.longitude * .pi / 180
        sinLat = sin(lat); cosLat = cos(lat); sinLon = sin(lon); cosLon = cos(lon)
    }

    /// Converts an ECEF vector (km) relative to the observer into East-North-Up.
    public func enu(ofECEF target: Vector3) -> Vector3 {
        let d = target - ecef
        let e = -sinLon * d.x + cosLon * d.y
        let n = -sinLat * cosLon * d.x - sinLat * sinLon * d.y + cosLat * d.z
        let u = cosLat * cosLon * d.x + cosLat * sinLon * d.y + sinLat * d.z
        return Vector3(e, n, u)
    }

    public func lookAngles(toECEF target: Vector3) -> LookAngles {
        let v = enu(ofECEF: target)
        let range = v.length
        var az = atan2(v.x, v.y) * 180 / .pi
        if az < 0 { az += 360 }
        let el = asin(max(-1, min(1, v.z / range))) * 180 / .pi
        return LookAngles(azimuth: az, elevation: el, range: range, enu: v / range)
    }

    public func lookAngles(toTEME r: Vector3, jd: Double) -> LookAngles {
        lookAngles(toECEF: temeToECEF(r, jd: jd))
    }
}

// MARK: - Sun

public enum Sun {
    public static let auKm = 149_597_870.7

    /// Low-precision geocentric equatorial position of the Sun in km (good to ~0.01°).
    public static func position(jd: Double) -> Vector3 {
        let n = jd - 2451545.0
        let deg = Double.pi / 180
        let l = fmod(280.460 + 0.9856474 * n, 360)
        let g = fmod(357.528 + 0.9856003 * n, 360) * deg
        let lambda = (l + 1.915 * sin(g) + 0.020 * sin(2 * g)) * deg
        let eps = (23.439 - 0.0000004 * n) * deg
        let r = (1.00014 - 0.01671 * cos(g) - 0.00014 * cos(2 * g)) * auKm
        return Vector3(r * cos(lambda), r * cos(eps) * sin(lambda), r * sin(eps) * sin(lambda))
    }

    /// True if a satellite at `r` (km, inertial) is in the Earth's shadow (cylindrical model).
    public static func isEclipsed(satellite r: Vector3, sun: Vector3) -> Bool {
        let s = sun.normalized
        let along = r.dot(s)
        if along > 0 { return false }
        let perpendicular = (r - s * along).length
        return perpendicular < 6378.137
    }
}
