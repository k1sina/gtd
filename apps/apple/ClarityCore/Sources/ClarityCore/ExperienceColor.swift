#if canImport(SwiftUI)
    import SwiftUI

    extension ExperienceCategory {
        /// Shared lifetime-map tint used by all app targets. Mirrors the hues
        /// in apps/web/src/components/life-map.tsx; system colors so they
        /// adapt to light and dark on their own.
        public var color: Color {
            switch self {
            case .travel: return .blue
            case .adventure: return .orange
            case .craft: return .purple
            case .people: return .pink
            case .create: return .teal
            case .wellbeing: return .green
            case .contribute: return .yellow
            case .other: return .gray
            }
        }
    }
#endif
