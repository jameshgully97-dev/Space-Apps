import AVFoundation
import Observation
import UIKit

/// Runs the back camera and reports its field of view so the sky overlay
/// can be projected with the same geometry as the video.
@MainActor
@Observable
final class CameraService {
    enum Status { case idle, running, unauthorized, unavailable }

    private(set) var status: Status = .idle
    /// Field of view along the sensor's long side, in degrees.
    private(set) var longSideFOV: Double = 65
    /// Video aspect ratio, long side / short side.
    private(set) var aspectRatio: Double = 16.0 / 9.0

    nonisolated let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "camera.session")
    private var configured = false

    func start() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureAndRun()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                Task { @MainActor in
                    if granted { self.configureAndRun() } else { self.status = .unauthorized }
                }
            }
        default:
            status = .unauthorized
        }
    }

    func stop() {
        let session = session
        sessionQueue.async { if session.isRunning { session.stopRunning() } }
    }

    private func configureAndRun() {
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            status = .unavailable
            return
        }
        let session = session
        let needsConfig = !configured
        configured = true

        sessionQueue.async {
            if needsConfig {
                session.beginConfiguration()
                session.sessionPreset = .high
                if let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) {
                    session.addInput(input)
                }
                session.commitConfiguration()
            }
            if !session.isRunning { session.startRunning() }

            let fov = Double(device.activeFormat.videoFieldOfView)
            let d = CMVideoFormatDescriptionGetDimensions(device.activeFormat.formatDescription)
            let w = Double(max(d.width, d.height)), h = Double(min(d.width, d.height))
            Task { @MainActor in
                self.status = .running
                if fov > 1 { self.longSideFOV = fov }
                if h > 0 { self.aspectRatio = w / h }
            }
        }
    }
}
