import OrbitCore
import SwiftUI

/// All-sky chart: zenith in the centre, horizon at the edge, north up, east left
/// (as when lying on your back looking up). Works without camera or motion sensors.
struct SkyMapView: View {
    @Environment(AppModel.self) private var model
    @State private var showDetail = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                GeometryReader { geo in
                    let side = min(geo.size.width, geo.size.height) - 24
                    let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
                    TimelineView(.periodic(from: .now, by: 0.25)) { timeline in
                        Canvas { context, _ in
                            drawChart(in: &context, center: center, radius: side / 2, date: timeline.date)
                        }
                    }
                    .contentShape(Rectangle())
                    .gesture(SpatialTapGesture().onEnded { value in
                        select(at: value.location, center: center, radius: side / 2)
                    })
                }
                .background(Color.black)

                if let sat = model.selected {
                    Button { showDetail = true } label: {
                        HStack {
                            Circle().fill(sat.category.color).frame(width: 10, height: 10)
                            Text(sat.name).font(.headline)
                            Spacer()
                            Text(String(format: "Az %.0f° El %.0f°", sat.look.azimuth, sat.look.elevation))
                                .font(.subheadline.monospacedDigit())
                            Image(systemName: "chevron.right")
                        }
                        .padding()
                    }
                    .buttonStyle(.plain)
                    .background(.thinMaterial)
                }
            }
            .navigationTitle("Sky Map")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showDetail) {
                if let id = model.selectedID {
                    NavigationStack { SatelliteDetailView(satelliteID: id) }
                }
            }
        }
    }

    private func point(az: Double, el: Double, center: CGPoint, radius: Double) -> CGPoint {
        let r = (90 - el) / 90 * radius
        let a = az * .pi / 180
        return CGPoint(x: center.x - r * sin(a), y: center.y - r * cos(a))
    }

    private func drawChart(in context: inout GraphicsContext, center: CGPoint, radius: Double, date: Date) {
        let grid = GraphicsContext.Shading.color(.green.opacity(0.35))
        for el in [0.0, 30, 60] {
            let r = (90 - el) / 90 * radius
            context.stroke(Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r)),
                           with: grid, lineWidth: el == 0 ? 1.5 : 0.75)
        }
        for az in stride(from: 0.0, to: 360, by: 45) {
            var p = Path()
            p.move(to: center)
            p.addLine(to: point(az: az, el: 0, center: center, radius: radius))
            context.stroke(p, with: grid, lineWidth: 0.5)
        }
        for (az, name) in [(0.0, "N"), (90, "E"), (180, "S"), (270, "W")] {
            let p = point(az: az, el: -8, center: center, radius: radius)
            context.draw(Text(name).font(.headline).foregroundStyle(.green), at: p)
        }

        for sat in model.visibleSatellites {
            let enu = sat.enu(at: date)
            let el = asin(max(-1, min(1, enu.z))) * 180 / .pi
            guard el >= 0 else { continue }
            var az = atan2(enu.x, enu.y) * 180 / .pi
            if az < 0 { az += 360 }
            let p = point(az: az, el: el, center: center, radius: radius)
            let r: CGFloat = sat.category == .station ? 5 : (sat.isBright ? 3.5 : 2)
            context.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r)),
                         with: .color(sat.category.color.opacity(sat.isSunlit ? 1 : 0.4)))
            if sat.id == model.selectedID {
                context.stroke(Path(ellipseIn: CGRect(x: p.x - 10, y: p.y - 10, width: 20, height: 20)),
                               with: .color(.green), lineWidth: 2)
                context.draw(Text(sat.name).font(.caption.bold()).foregroundStyle(.green),
                             at: CGPoint(x: p.x + 12, y: p.y), anchor: .leading)
            } else if sat.category == .station {
                context.draw(Text(sat.name).font(.caption2).foregroundStyle(.yellow),
                             at: CGPoint(x: p.x + 8, y: p.y), anchor: .leading)
            }
        }
    }

    private func select(at location: CGPoint, center: CGPoint, radius: Double) {
        var best: (Int, CGFloat)?
        for sat in model.visibleSatellites where sat.look.elevation >= 0 {
            let p = point(az: sat.look.azimuth, el: sat.look.elevation, center: center, radius: radius)
            let d = hypot(p.x - location.x, p.y - location.y)
            if d < 30, d < (best?.1 ?? .infinity) { best = (sat.id, d) }
        }
        model.selectedID = best?.0
    }
}
