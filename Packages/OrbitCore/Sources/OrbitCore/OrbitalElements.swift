import Foundation

/// Mean orbital elements (SGP4 / Kozai mean elements) for one object.
///
/// Can be built from a CelesTrak OMM JSON record or from a classic two-line element set.
public struct OrbitalElements: Sendable, Hashable, Codable {
    public var name: String
    public var noradID: Int
    public var internationalDesignator: String
    /// Epoch as a Julian Date (UTC).
    public var epochJD: Double
    /// Mean motion in revolutions per day.
    public var meanMotion: Double
    public var eccentricity: Double
    /// Degrees.
    public var inclination: Double
    /// Degrees.
    public var raan: Double
    /// Degrees.
    public var argumentOfPerigee: Double
    /// Degrees.
    public var meanAnomaly: Double
    /// Drag term, 1 / earth radii.
    public var bstar: Double
    public var meanMotionDot: Double
    public var meanMotionDDot: Double

    public init(name: String, noradID: Int, internationalDesignator: String = "", epochJD: Double,
                meanMotion: Double, eccentricity: Double, inclination: Double, raan: Double,
                argumentOfPerigee: Double, meanAnomaly: Double, bstar: Double,
                meanMotionDot: Double = 0, meanMotionDDot: Double = 0) {
        self.name = name
        self.noradID = noradID
        self.internationalDesignator = internationalDesignator
        self.epochJD = epochJD
        self.meanMotion = meanMotion
        self.eccentricity = eccentricity
        self.inclination = inclination
        self.raan = raan
        self.argumentOfPerigee = argumentOfPerigee
        self.meanAnomaly = meanAnomaly
        self.bstar = bstar
        self.meanMotionDot = meanMotionDot
        self.meanMotionDDot = meanMotionDDot
    }

    public var epoch: Date { Date(julianDate: epochJD) }

    /// Orbital period in minutes.
    public var periodMinutes: Double { 1440.0 / meanMotion }
}

// MARK: - OMM (CelesTrak JSON)

/// One record of CelesTrak's `FORMAT=json` GP data (CCSDS OMM keywords).
public struct OMMRecord: Decodable, Sendable {
    public let OBJECT_NAME: String
    public let OBJECT_ID: String?
    public let EPOCH: String
    public let MEAN_MOTION: Double
    public let ECCENTRICITY: Double
    public let INCLINATION: Double
    public let RA_OF_ASC_NODE: Double
    public let ARG_OF_PERICENTER: Double
    public let MEAN_ANOMALY: Double
    public let NORAD_CAT_ID: Int
    public let BSTAR: Double
    public let MEAN_MOTION_DOT: Double?
    public let MEAN_MOTION_DDOT: Double?
}

public enum ElementsParseError: Error, Equatable {
    case badEpoch(String)
    case badTLE(String)
}

extension OrbitalElements {
    public init(omm: OMMRecord) throws {
        guard let jd = JulianDate.parseISO8601UTC(omm.EPOCH) else {
            throw ElementsParseError.badEpoch(omm.EPOCH)
        }
        self.init(name: omm.OBJECT_NAME.trimmingCharacters(in: .whitespaces),
                  noradID: omm.NORAD_CAT_ID,
                  internationalDesignator: omm.OBJECT_ID ?? "",
                  epochJD: jd,
                  meanMotion: omm.MEAN_MOTION,
                  eccentricity: omm.ECCENTRICITY,
                  inclination: omm.INCLINATION,
                  raan: omm.RA_OF_ASC_NODE,
                  argumentOfPerigee: omm.ARG_OF_PERICENTER,
                  meanAnomaly: omm.MEAN_ANOMALY,
                  bstar: omm.BSTAR,
                  meanMotionDot: omm.MEAN_MOTION_DOT ?? 0,
                  meanMotionDDot: omm.MEAN_MOTION_DDOT ?? 0)
    }

    /// Decodes a CelesTrak JSON array. Records that fail to parse are skipped.
    public static func decodeCelesTrakJSON(_ data: Data) throws -> [OrbitalElements] {
        let records = try JSONDecoder().decode([OMMRecord].self, from: data)
        return records.compactMap { try? OrbitalElements(omm: $0) }
    }
}

// MARK: - TLE

extension OrbitalElements {
    /// Parses a two-line element set (optionally with a name line).
    public init(name: String? = nil, line1: String, line2: String) throws {
        let l1 = Array(line1)
        let l2 = Array(line2)
        guard l1.count >= 64, l2.count >= 63, l1[0] == "1", l2[0] == "2" else {
            throw ElementsParseError.badTLE("lines too short or wrong line numbers")
        }
        func field(_ chars: [Character], _ from: Int, _ to: Int) -> String {
            // 1-based inclusive columns, as in the TLE spec.
            let end = min(to, chars.count)
            guard from - 1 < end else { return "" }
            return String(chars[(from - 1)..<end]).trimmingCharacters(in: .whitespaces)
        }
        func number(_ s: String) throws -> Double {
            guard let v = Double(s) else { throw ElementsParseError.badTLE("bad number '\(s)'") }
            return v
        }
        /// Parses the "assumed decimal point" exponent format, e.g. " 12345-3" = 0.12345e-3.
        func expField(_ s: String) throws -> Double {
            var str = s.replacingOccurrences(of: " ", with: "")
            if str.isEmpty { return 0 }
            var sign = 1.0
            if str.hasPrefix("-") { sign = -1; str.removeFirst() } else if str.hasPrefix("+") { str.removeFirst() }
            guard str.count >= 2 else { return 0 }
            let expPart = String(str.suffix(2))
            let mantissa = String(str.dropLast(2))
            guard let m = Double("0." + mantissa), let e = Double(expPart.replacingOccurrences(of: "+", with: "")) else {
                throw ElementsParseError.badTLE("bad exponent field '\(s)'")
            }
            return sign * m * pow(10, e)
        }

        let satnum = field(l1, 3, 7)
        let yy = try number(field(l1, 19, 20))
        let dayOfYear = try number(field(l1, 21, 32))
        let year = yy < 57 ? 2000 + Int(yy) : 1900 + Int(yy)
        let epoch = JulianDate.from(year: year, month: 1, day: 1, hour: 0, minute: 0, second: 0) + dayOfYear - 1.0

        let ndot = try number(field(l1, 34, 43))
        let nddot = try expField(field(l1, 45, 52))
        let bstar = try expField(field(l1, 54, 61))

        let incl = try number(field(l2, 9, 16))
        let raan = try number(field(l2, 18, 25))
        let ecc = try number("0." + field(l2, 27, 33))
        let argp = try number(field(l2, 35, 42))
        let ma = try number(field(l2, 44, 51))
        let mm = try number(field(l2, 53, 63))

        self.init(name: name?.trimmingCharacters(in: .whitespaces) ?? satnum,
                  noradID: OrbitalElements.decodeAlpha5(satnum),
                  internationalDesignator: field(l1, 10, 17),
                  epochJD: epoch,
                  meanMotion: mm,
                  eccentricity: ecc,
                  inclination: incl,
                  raan: raan,
                  argumentOfPerigee: argp,
                  meanAnomaly: ma,
                  bstar: bstar,
                  meanMotionDot: ndot,
                  meanMotionDDot: nddot)
    }

    /// Decodes Alpha-5 catalog numbers (e.g. "A0001" = 100001).
    static func decodeAlpha5(_ s: String) -> Int {
        guard let first = s.first else { return 0 }
        if first.isLetter, let rest = Int(s.dropFirst()) {
            let letters = Array("ABCDEFGHJKLMNPQRSTUVWXYZ") // I and O are skipped
            if let idx = letters.firstIndex(of: Character(first.uppercased())) {
                return (idx + 10) * 10000 + rest
            }
        }
        return Int(s) ?? 0
    }

    /// Parses a block of 2- or 3-line element sets.
    public static func parseTLEText(_ text: String) -> [OrbitalElements] {
        let lines = text.split(whereSeparator: \.isNewline).map { String($0) }
        var result: [OrbitalElements] = []
        var i = 0
        while i < lines.count {
            let line = lines[i]
            if line.hasPrefix("1 "), i + 1 < lines.count, lines[i + 1].hasPrefix("2 ") {
                var name: String? = nil
                if i > 0, !lines[i - 1].hasPrefix("1 "), !lines[i - 1].hasPrefix("2 ") {
                    name = lines[i - 1].hasPrefix("0 ") ? String(lines[i - 1].dropFirst(2)) : lines[i - 1]
                }
                if let el = try? OrbitalElements(name: name, line1: line, line2: lines[i + 1]) {
                    result.append(el)
                }
                i += 2
            } else {
                i += 1
            }
        }
        return result
    }
}
