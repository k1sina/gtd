import Foundation

/// Supabase connection settings. App targets carry these in their Info.plist
/// (mapped from Configs/Supabase.xcconfig by the Xcode build); the anon key is
/// public by design — authorization is enforced by RLS on the backend.
public struct SupabaseConfig: Sendable {
    public let url: URL
    public let anonKey: String

    public init(url: URL, anonKey: String) {
        self.url = url
        self.anonKey = anonKey
    }

    public static func fromBundle(_ bundle: Bundle = .main) -> SupabaseConfig {
        guard
            let urlString = bundle.object(forInfoDictionaryKey: "SupabaseURL") as? String,
            let url = URL(string: urlString),
            let anonKey = bundle.object(forInfoDictionaryKey: "SupabaseAnonKey") as? String,
            !anonKey.isEmpty
        else {
            fatalError(
                "SupabaseURL / SupabaseAnonKey missing from Info.plist — check Configs/Supabase.xcconfig")
        }
        return SupabaseConfig(url: url, anonKey: anonKey)
    }
}
