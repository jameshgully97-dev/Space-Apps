import CoreLocation
import Observation
import OrbitCore

@MainActor
@Observable
final class LocationService: NSObject, CLLocationManagerDelegate {
    private(set) var location: GeodeticPosition?
    private(set) var authorization: CLAuthorizationStatus = .notDetermined
    private(set) var accuracy: CLLocationAccuracy?

    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = 100
        authorization = manager.authorizationStatus
    }

    func start() {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        manager.startUpdatingLocation()
    }

    var isDenied: Bool { authorization == .denied || authorization == .restricted }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        let pos = GeodeticPosition(latitude: loc.coordinate.latitude,
                                   longitude: loc.coordinate.longitude,
                                   altitude: max(loc.altitude, 0) / 1000.0)
        let acc = loc.horizontalAccuracy
        Task { @MainActor in
            self.location = pos
            self.accuracy = acc
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.authorization = status
            if status == .authorizedWhenInUse || status == .authorizedAlways {
                self.manager.startUpdatingLocation()
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}
