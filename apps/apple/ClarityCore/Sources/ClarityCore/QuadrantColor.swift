#if canImport(SwiftUI)
    import SwiftUI

    extension Quadrant {
        /// Shared quadrant tint used by all app targets (iOS, macOS, watchOS).
        /// Mirrors the web's --color-q-* tokens.
        public var color: Color {
            switch self {
            case .doFirst: return .red
            case .schedule: return .blue
            case .delegate: return .orange
            case .eliminate: return .gray
            }
        }
    }
#endif
