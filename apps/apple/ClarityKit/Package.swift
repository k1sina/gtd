// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ClarityKit",
    platforms: [.iOS(.v17), .macOS(.v14), .watchOS(.v10)],
    products: [
        .library(name: "ClarityKit", targets: ["ClarityKit"])
    ],
    dependencies: [
        .package(path: "../ClarityCore"),
        .package(url: "https://github.com/supabase/supabase-swift.git", exact: "2.50.0"),
    ],
    targets: [
        .target(
            name: "ClarityKit",
            dependencies: [
                .product(name: "ClarityCore", package: "ClarityCore"),
                .product(name: "Supabase", package: "supabase-swift"),
            ],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .testTarget(
            name: "ClarityKitTests",
            dependencies: ["ClarityKit"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)
