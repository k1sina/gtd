import Foundation

/// The one JSON strategy used for every PostgREST round-trip. Models are
/// camelCase; columns are snake_case; timestamps arrive as ISO 8601 with
/// microsecond fractions ("2026-07-07T14:42:17.793486+00:00").
public enum PostgrestJSON {
    public static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom { d in
            let container = try d.singleValueContainer()
            let raw = try container.decode(String.self)
            if let date = parseTimestamp(raw) { return date }
            throw DecodingError.dataCorruptedError(
                in: container, debugDescription: "Unrecognized timestamp: \(raw)")
        }
        return decoder
    }()

    public static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .custom { date, e in
            var container = e.singleValueContainer()
            try container.encode(isoFractional.string(from: date))
        }
        return encoder
    }()

    private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func parseTimestamp(_ raw: String) -> Date? {
        if let date = isoFractional.date(from: raw) ?? isoPlain.date(from: raw) {
            return date
        }
        // ISO8601DateFormatter only accepts exactly 3 fractional digits;
        // Postgres sends up to 6. Trim the fraction and retry.
        let trimmed = raw.replacingOccurrences(
            of: #"\.(\d{3})\d*"#, with: ".$1", options: .regularExpression)
        return isoFractional.date(from: trimmed) ?? isoPlain.date(from: trimmed)
    }
}
