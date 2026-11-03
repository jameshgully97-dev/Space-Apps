import CoreMotion
import Foundation
import os
import simd

/// Device attitude relative to a north/west/up reference frame.
///
/// `matrix * v` maps a vector expressed in the reference frame
/// (x = true north, y = west, z = up) into device coordinates
/// (x = right edge, y = top edge, z = out of the screen).
struct DeviceAttitude: Sendable {
    var matrix: simd_double3x3
    var usesTrueNorth: Bool
    var timestamp: TimeInterval
}

/// Streams device motion. The latest sample is read directly by the
/// render loop (not via SwiftUI observation) so it can run at 60 fps.
final class MotionService: @unchecked Sendable {
    private let manager = CMMotionManager()
    private let queue = OperationQueue()
    private let state = OSAllocatedUnfairLock<DeviceAttitude?>(initialState: nil)
    /// Positive score: CMRotationMatrix rows map reference -> device. Negative: it is the transpose.
    private var conventionScore = 0.0

    var isAvailable: Bool { manager.isDeviceMotionAvailable }

    var latest: DeviceAttitude? { state.withLock { $0 } }

    func start() {
        guard manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }
        queue.maxConcurrentOperationCount = 1
        manager.deviceMotionUpdateInterval = 1.0 / 60.0

        let frames = CMMotionManager.availableAttitudeReferenceFrames()
        let trueNorth = frames.contains(.xTrueNorthZVertical)
        let frame: CMAttitudeReferenceFrame = trueNorth ? .xTrueNorthZVertical : .xMagneticNorthZVertical

        manager.startDeviceMotionUpdates(using: frame, to: queue) { [weak self] motion, _ in
            guard let self, let motion else { return }
            let m = motion.attitude.rotationMatrix
            let rows = simd_double3x3(rows: [
                SIMD3(m.m11, m.m12, m.m13),
                SIMD3(m.m21, m.m22, m.m23),
                SIMD3(m.m31, m.m32, m.m33),
            ])
            // Resolve the matrix convention from gravity, which CoreMotion reports in
            // device coordinates: the correct matrix maps "down" (0,0,-1) onto it.
            let g = SIMD3(motion.gravity.x, motion.gravity.y, motion.gravity.z)
            let down = SIMD3<Double>(0, 0, -1)
            let errRows = simd_length(rows * down - g)
            let errTransposed = simd_length(rows.transpose * down - g)
            self.conventionScore = max(-50, min(50, self.conventionScore + (errTransposed - errRows)))
            let matrix = self.conventionScore >= 0 ? rows : rows.transpose

            let attitude = DeviceAttitude(matrix: matrix, usesTrueNorth: trueNorth, timestamp: motion.timestamp)
            self.state.withLock { $0 = attitude }
        }
    }

    func stop() {
        manager.stopDeviceMotionUpdates()
    }
}
