// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ClarityCore",
    platforms: [.iOS(.v17), .macOS(.v14), .watchOS(.v10)],
    products: [
        .library(name: "ClarityCore", targets: ["ClarityCore"])
    ],
    targets: [
        .target(name: "ClarityCore"),
        .testTarget(name: "ClarityCoreTests", dependencies: ["ClarityCore"]),
    ]
)
