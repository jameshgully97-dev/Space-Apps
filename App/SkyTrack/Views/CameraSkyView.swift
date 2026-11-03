import OrbitCore
import SwiftUI

/// Live camera with satellites drawn where they are in the sky.
struct CameraSkyView: View {
    @Environment(AppModel.self) private var model
    @State private var showDetail = false

    var body: some View {
        ZStack {
            if model.camera.status == .running {
                CameraPreview(session: model.camera.session).ignoresSafeArea()
            } else {
                Color.black.ignoresSafeArea()
            }

            if model.motion.isAvailable {
                SkyOverlay().ignoresSafeArea()
            } else {
                ContentUnavailableView("Motion sensors unavailable",
                                       systemImage: "gyroscope",
                                       description: Text("Run on an iPhone to use the camera view, or use the Sky Map tab."))
                    .foregroundStyle(.white)
            }

            VStack {
                StatusBar()
                Spacer()
                if let sat = model.selected {
                    SelectedCard(sat: sat) { showDetail = true }
                        .padding()
                }
            }
        }
        .onAppear {
            model.camera.start()
            model.motion.start()
        }
        .onDisappear {
            model.camera.stop()
            model.motion.stop()
        }
        .sheet(isPresented: $showDetail) {
            if let id = model.selectedID {
                NavigationStack { SatelliteDetailView(satelliteID: id) }
            }
        }
    }
}

private struct StatusBar: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        HStack(spacing: 12) {
            Label("\(model.visibleSatellites.count) overhead", systemImage: "dot.radiowaves.up.forward")
            if model.catalog.isLoading {
                ProgressView().tint(.white)
            }
            Spacer()
            if model.observerLocation == nil {
                Label("No location", systemImage: "location.slash").foregroundStyle(.orange)
            } else if model.isDarkSky {
                Label("Dark sky", systemImage: "moon.stars.fill")
            } else {
                Label("Daylight", systemImage: "sun.max.fill").foregroundStyle(.yellow)
            }
        }
        .font(.footnote.weight(.semibold))
        .foregroundStyle(.white)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial.opacity(0.8), in: Capsule())
        .padding(.top, 8)
        .padding(.horizontal)
    }
}

private struct SelectedCard: View {
    let sat: TrackedSatellite
    let onDetails: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(sat.name).font(.headline)
                Text(String(format: "Az %.0f°  El %.0f°  %.0f km away", sat.look.azimuth, sat.look.elevation, sat.look.range))
                    .font(.caption.monospacedDigit())
                Text(String(format: "Alt %.0f km · %.1f km/s · %@", sat.subPoint.altitude, sat.speedKmS,
                            sat.isSunlit ? "sunlit" : "in Earth's shadow"))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Details", action: onDetails).buttonStyle(.borderedProminent)
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

/// Canvas redrawn every frame from the latest device attitude.
private struct SkyOverlay: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        GeometryReader { geo in
            TimelineView(.animation) { timeline in
                Canvas { context, size in
                    guard let projector = makeProjector(size: size) else { return }
                    draw(in: &context, projector: projector, date: timeline.date)
                }
            }
            .contentShape(Rectangle())
            .gesture(SpatialTapGesture().onEnded { value in
                select(near: value.location, size: geo.size)
            })
        }
    }

    private func makeProjector(size: CGSize) -> SkyProjector? {
        guard let attitude = model.motion.latest else { return nil }
        return SkyProjector(attitude: attitude.matrix, size: size,
                            longSideFOV: model.camera.longSideFOV,
                            aspectRatio: model.camera.aspectRatio,
                            headingOffset: model.settings.headingOffset)
    }

    private func select(near point: CGPoint, size: CGSize) {
        guard let projector = makeProjector(size: size) else { return }
        let now = Date()
        var best: (id: Int, dist: CGFloat)?
        for sat in model.visibleSatellites {
            let p = projector.project(sat.enu(at: now))
            guard p.inFront else { continue }
            let d = hypot(p.point.x - point.x, p.point.y - point.y)
            if d < 44, d < (best?.dist ?? .infinity) { best = (sat.id, d) }
        }
        model.selectedID = best?.id
    }

    private func draw(in context: inout GraphicsContext, projector: SkyProjector, date: Date) {
        drawHorizon(in: &context, projector: projector)

        let center = CGPoint(x: projector.size.width / 2, y: projector.size.height / 2)
        var labelCandidates: [(TrackedSatellite, CGPoint, CGFloat)] = []

        for sat in model.visibleSatellites {
            let p = projector.project(sat.enu(at: date))
            guard projector.isOnScreen(p, margin: 20) else { continue }
            let isSelected = sat.id == model.selectedID
            let radius: CGFloat = sat.category == .station ? 6 : (sat.isBright ? 4.5 : 3)
            let rect = CGRect(x: p.point.x - radius, y: p.point.y - radius, width: radius * 2, height: radius * 2)
            let color = sat.category.color.opacity(sat.isSunlit ? 1 : 0.45)
            context.fill(Path(ellipseIn: rect), with: .color(color))
            if isSelected {
                let ring = rect.insetBy(dx: -10, dy: -10)
                context.stroke(Path(ellipseIn: ring), with: .color(.green), lineWidth: 2)
            }
            let dist = hypot(p.point.x - center.x, p.point.y - center.y)
            labelCandidates.append((sat, p.point, dist))
        }

        if model.settings.showLabels {
            // Label stations, bright objects, the selection and whatever is near the reticle.
            let near = labelCandidates.sorted { $0.2 < $1.2 }.prefix(6).map(\.0.id)
            let nearSet = Set(near)
            for (sat, point, dist) in labelCandidates {
                let important = sat.category == .station || sat.id == model.selectedID
                guard important || (nearSet.contains(sat.id) && dist < 160) || (sat.isBright && dist < 260) else { continue }
                let text = Text(sat.name)
                    .font(.system(size: important ? 13 : 11, weight: important ? .bold : .medium))
                    .foregroundStyle(sat.category.color)
                context.draw(text, at: CGPoint(x: point.x + 8, y: point.y - 8), anchor: .bottomLeading)
            }
        }

        // Reticle
        let reticle = CGRect(x: center.x - 18, y: center.y - 18, width: 36, height: 36)
        context.stroke(Path(ellipseIn: reticle), with: .color(.white.opacity(0.6)), lineWidth: 1)

        let bore = projector.boresight
        let heading = Text(String(format: "%@ %.0f°  ·  El %.0f°", compassName(bore.azimuth), bore.azimuth, bore.elevation))
            .font(.caption.monospacedDigit().weight(.semibold))
            .foregroundStyle(.white.opacity(0.85))
        context.draw(heading, at: CGPoint(x: center.x, y: center.y + 32), anchor: .top)

        if let sel = model.selected {
            drawPointer(to: sel, in: &context, projector: projector, date: date)
        }
    }

    private func drawHorizon(in context: inout GraphicsContext, projector: SkyProjector) {
        var path = Path()
        var penDown = false
        for az in stride(from: 0.0, through: 360.0, by: 3.0) {
            let p = projector.project(.enu(azimuth: az, elevation: 0))
            if projector.isOnScreen(p, margin: 400) {
                if penDown { path.addLine(to: p.point) } else { path.move(to: p.point); penDown = true }
            } else {
                penDown = false
            }
        }
        context.stroke(path, with: .color(.green.opacity(0.7)), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))

        for (az, name) in [(0.0, "N"), (45, "NE"), (90, "E"), (135, "SE"), (180, "S"), (225, "SW"), (270, "W"), (315, "NW")] {
            let p = projector.project(.enu(azimuth: az, elevation: 0))
            guard projector.isOnScreen(p) else { continue }
            context.draw(Text(name).font(.headline).foregroundStyle(.green), at: p.point, anchor: .bottom)
        }
        // Zenith marker
        let z = projector.project(.enu(azimuth: 0, elevation: 90))
        if projector.isOnScreen(z) {
            context.draw(Text("+ zenith").font(.caption2).foregroundStyle(.green.opacity(0.8)), at: z.point)
        }
    }

    /// Arrow at the screen edge pointing towards the selected satellite when it is off-screen.
    private func drawPointer(to sat: TrackedSatellite, in context: inout GraphicsContext, projector: SkyProjector, date: Date) {
        let p = projector.project(sat.enu(at: date))
        guard !projector.isOnScreen(p) else { return }
        let size = projector.size
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        var dx: Double, dy: Double
        if p.inFront {
            dx = p.point.x - center.x; dy = p.point.y - center.y
        } else {
            dx = p.device.x; dy = -p.device.y
            if abs(dx) + abs(dy) < 1e-6 { dy = 1 }
        }
        let len = (dx * dx + dy * dy).squareRoot()
        dx /= len; dy /= len
        let inset: Double = 50
        let tx = (Double(size.width) / 2 - inset) / max(abs(dx), 1e-6)
        let ty = (Double(size.height) / 2 - inset) / max(abs(dy), 1e-6)
        let t = min(tx, ty)
        let tip = CGPoint(x: center.x + dx * t, y: center.y + dy * t)

        let angle = atan2(dy, dx)
        var arrow = Path()
        arrow.move(to: CGPoint(x: 18, y: 0))
        arrow.addLine(to: CGPoint(x: -10, y: -12))
        arrow.addLine(to: CGPoint(x: -4, y: 0))
        arrow.addLine(to: CGPoint(x: -10, y: 12))
        arrow.closeSubpath()
        let transform = CGAffineTransform(translationX: tip.x, y: tip.y).rotated(by: angle)
        context.fill(arrow.applying(transform), with: .color(.green))
        context.draw(Text(sat.name).font(.caption.bold()).foregroundStyle(.green),
                     at: CGPoint(x: tip.x - dx * 34, y: tip.y - dy * 34))
    }

    private func compassName(_ az: Double) -> String {
        let names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        return names[Int((az + 22.5) / 45) % 8]
    }
}
