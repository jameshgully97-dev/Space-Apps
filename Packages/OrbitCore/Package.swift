// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "OrbitCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "OrbitCore", targets: ["OrbitCore"]),
    ],
    targets: [
        .target(name: "OrbitCore"),
        .testTarget(name: "OrbitCoreTests", dependencies: ["OrbitCore"]),
    ]
)
