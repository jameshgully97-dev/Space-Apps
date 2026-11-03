import CoreGraphics
import Foundation
import OrbitCore
import simd

/// Projects sky directions (East-North-Up unit vectors) onto the screen of a
/// phone held in portrait with the back camera pointed at the sky.
struct SkyProjector {
    let attitude: simd_double3x3
    /// Focal length in points.
    let focal: Double
    let size: CGSize
    /// Degrees added to every azimuth (compass correction).
    let headingOffset: Double

    struct Projection {
        var point: CGPoint
        /// In front of the camera (may still be off-screen).
        var inFront: Bool
        /// Device-frame direction, used for off-screen arrows.
        var device: SIMD3<Double>
    }

    /// - Parameters:
    ///   - longSideFOV: camera field of view along the video's long side (degrees).
    ///   - aspectRatio: video long side / short side.
    init(attitude: simd_double3x3, size: CGSize, longSideFOV: Double, aspectRatio: Double, headingOffset: Double) {
        self.attitude = attitude
        self.size = size
        self.headingOffset = headingOffset
        // The preview uses aspect-fill: in portrait the video's long side is vertical.
        let scale = max(Double(size.width) / 1.0, Double(size.height) / aspectRatio)
        let longSidePoints = aspectRatio * scale
        focal = (longSidePoints / 2) / tan(longSideFOV * .pi / 360)
    }

    func project(_ enu: Vector3) -> Projection {
        let d = headingOffset * .pi / 180
        let e = enu.x * cos(d) + enu.y * sin(d)
        let n = enu.y * cos(d) - enu.x * sin(d)
        // Reference frame: x = north, y = west, z = up.
        let device = attitude * SIMD3(n, -e, enu.z)
        let cx = Double(size.width) / 2, cy = Double(size.height) / 2
        guard device.z < -1e-6 else {
            return Projection(point: CGPoint(x: cx, y: cy), inFront: false, device: device)
        }
        let x = cx + focal * device.x / -device.z
        let y = cy - focal * device.y / -device.z
        return Projection(point: CGPoint(x: x, y: y), inFront: true, device: device)
    }

    func isOnScreen(_ p: Projection, margin: CGFloat = 0) -> Bool {
        p.inFront && p.point.x >= -margin && p.point.y >= -margin
            && p.point.x <= size.width + margin && p.point.y <= size.height + margin
    }

    /// Where the camera is pointing, as azimuth/elevation in degrees.
    var boresight: (azimuth: Double, elevation: Double) {
        // Camera looks along device -z; convert back into the reference frame.
        let ref = attitude.transpose * SIMD3<Double>(0, 0, -1)
        let n = ref.x, e = -ref.y, u = ref.z
        var az = atan2(e, n) * 180 / .pi - headingOffset
        az = az.truncatingRemainder(dividingBy: 360)
        if az < 0 { az += 360 }
        return (az, asin(max(-1, min(1, u))) * 180 / .pi)
    }
}

extension Vector3 {
    /// ENU unit vector for an azimuth/elevation in degrees.
    static func enu(azimuth: Double, elevation: Double) -> Vector3 {
        let az = azimuth * .pi / 180, el = elevation * .pi / 180
        return Vector3(sin(az) * cos(el), cos(az) * cos(el), sin(el))
    }
}
