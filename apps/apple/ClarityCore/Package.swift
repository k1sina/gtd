// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ClarityCore",
    platforms: [.iOS(.v17), .macOS(.v14), .watchOS(.v10)],
    products: [
        .library(name: "ClarityCore", targets: ["ClarityCore"])
    ],
    targets: [
        .target(
            name: "ClarityCore",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .testTarget(
            name: "ClarityCoreTests",
            dependencies: ["ClarityCore"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)
