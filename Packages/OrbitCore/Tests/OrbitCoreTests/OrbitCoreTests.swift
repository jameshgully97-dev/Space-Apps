import XCTest
@testable import OrbitCore

final class SGP4Tests: XCTestCase {
    /// Compares against Vallado's reference implementation (via python-sgp4).
    func testMatchesReferenceImplementation() throws {
        XCTAssertFalse(referenceVectors.isEmpty)
        for ref in referenceVectors {
            let elements = try OrbitalElements(line1: ref.line1, line2: ref.line2)
            let sat = try SGP4(elements: elements)
            let state = try sat.propagate(minutesSinceEpoch: ref.tsince)
            let label = "\(elements.noradID) t=\(ref.tsince)"
            // Position within 1 m, velocity within 1 mm/s.
            XCTAssertEqual(state.position.x, ref.r[0], accuracy: 1e-3, label)
            XCTAssertEqual(state.position.y, ref.r[1], accuracy: 1e-3, label)
            XCTAssertEqual(state.position.z, ref.r[2], accuracy: 1e-3, label)
            XCTAssertEqual(state.velocity.x, ref.v[0], accuracy: 1e-6, label)
            XCTAssertEqual(state.velocity.y, ref.v[1], accuracy: 1e-6, label)
            XCTAssertEqual(state.velocity.z, ref.v[2], accuracy: 1e-6, label)
        }
    }

    func testOMMMatchesTLE() throws {
        let tle = try OrbitalElements(
            line1: "1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9002",
            line2: "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391428000")
        let json = """
        [{"OBJECT_NAME":"ISS (ZARYA)","OBJECT_ID":"1998-067A","EPOCH":"2024-01-01T12:00:00.000000",
          "MEAN_MOTION":15.72125391,"ECCENTRICITY":0.0006703,"INCLINATION":51.6416,"RA_OF_ASC_NODE":247.4627,
          "ARG_OF_PERICENTER":130.536,"MEAN_ANOMALY":325.0288,"EPHEMERIS_TYPE":0,"CLASSIFICATION_TYPE":"U",
          "NORAD_CAT_ID":25544,"ELEMENT_SET_NO":999,"REV_AT_EPOCH":42800,"BSTAR":0.0001027,
          "MEAN_MOTION_DOT":0.00016717,"MEAN_MOTION_DDOT":0}]
        """
        let omm = try OrbitalElements.decodeCelesTrakJSON(Data(json.utf8))
        XCTAssertEqual(omm.count, 1)
        XCTAssertEqual(omm[0].noradID, 25544)
        XCTAssertEqual(omm[0].epochJD, tle.epochJD, accuracy: 1e-8)
        XCTAssertEqual(omm[0].bstar, tle.bstar, accuracy: 1e-12)

        let a = try SGP4(elements: tle).propagate(minutesSinceEpoch: 90)
        let b = try SGP4(elements: omm[0]).propagate(minutesSinceEpoch: 90)
        XCTAssertEqual((a.position - b.position).length, 0, accuracy: 1e-6)
    }

    func testTLETextParsing() {
        let text = """
        ISS (ZARYA)
        1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9002
        2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391428000
        """
        let parsed = OrbitalElements.parseTLEText(text)
        XCTAssertEqual(parsed.count, 1)
        XCTAssertEqual(parsed.first?.name, "ISS (ZARYA)")
        XCTAssertEqual(OrbitalElements.decodeAlpha5("A0001"), 100001)
    }
}

final class AstroTests: XCTestCase {
    func testJulianDate() {
        XCTAssertEqual(JulianDate.from(year: 2000, month: 1, day: 1, hour: 12, minute: 0, second: 0), 2451545.0, accuracy: 1e-9)
        XCTAssertEqual(Date(timeIntervalSince1970: 0).julianDate, 2440587.5, accuracy: 1e-9)
    }

    func testGeodeticRoundTrip() {
        let p = GeodeticPosition(latitude: 51.4779, longitude: -0.0015, altitude: 0.046)
        let back = GeodeticPosition(ecef: p.ecef)
        XCTAssertEqual(back.latitude, p.latitude, accuracy: 1e-7)
        XCTAssertEqual(back.longitude, p.longitude, accuracy: 1e-7)
        XCTAssertEqual(back.altitude, p.altitude, accuracy: 1e-5)
    }

    func testLookAnglesStraightUp() {
        let obs = Observer(GeodeticPosition(latitude: 10, longitude: 20, altitude: 0))
        let above = GeodeticPosition(latitude: 10, longitude: 20, altitude: 400).ecef
        let look = obs.lookAngles(toECEF: above)
        XCTAssertEqual(look.elevation, 90, accuracy: 1e-6)
        XCTAssertEqual(look.range, 400, accuracy: 1e-6)
    }

    func testLookAnglesNorth() {
        let obs = Observer(GeodeticPosition(latitude: 0, longitude: 0, altitude: 0))
        let north = GeodeticPosition(latitude: 5, longitude: 0, altitude: 500).ecef
        XCTAssertEqual(obs.lookAngles(toECEF: north).azimuth, 0, accuracy: 1e-6)
        let east = GeodeticPosition(latitude: 0, longitude: 5, altitude: 500).ecef
        XCTAssertEqual(obs.lookAngles(toECEF: east).azimuth, 90, accuracy: 1e-6)
    }

    func testSunAtJuneSolstice() {
        let jd = JulianDate.from(year: 2024, month: 6, day: 20, hour: 20, minute: 51, second: 0)
        let s = Sun.position(jd: jd)
        let dec = asin(s.z / s.length) * 180 / .pi
        XCTAssertEqual(dec, 23.44, accuracy: 0.05)
    }

    func testPassPrediction() throws {
        let el = try OrbitalElements(
            line1: "1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9002",
            line2: "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391428000")
        let sat = try SGP4(elements: el)
        let obs = Observer(GeodeticPosition(latitude: 40, longitude: -75, altitude: 0))
        let passes = PassPredictor.passes(for: sat, observer: obs, from: el.epoch, hours: 48, minElevation: 0)
        XCTAssertFalse(passes.isEmpty)
        for p in passes {
            XCTAssertLessThan(p.rise, p.culmination)
            XCTAssertLessThan(p.culmination, p.set)
            XCTAssertLessThan(p.set.timeIntervalSince(p.rise), 20 * 60)
        }
    }
}
