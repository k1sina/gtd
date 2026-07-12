import ClarityCore
import SwiftUI

/// Context-tag + energy filter chips — GTD's engage criteria, shared by the
/// Next/Someday/Waiting lists (mirrors the web FilterChips component).
/// Selections persist per `storageKey` in UserDefaults so being @home in the
/// morning still means @home after lunch; a persisted tag that no longer
/// exists in the list is ignored, not applied invisibly.
struct TaskFilterChips: View {
    let storageKey: String
    let allTags: [String]
    let showEnergy: Bool
    @Binding var tagFilter: String?
    @Binding var energyFilter: Energy?

    @State private var restored = false

    var body: some View {
        if !allTags.isEmpty || showEnergy {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(allTags, id: \.self) { tag in
                        chip("@\(tag)", selected: tagFilter == tag) {
                            tagFilter = tagFilter == tag ? nil : tag
                        }
                    }
                    if !allTags.isEmpty && showEnergy {
                        Divider().frame(height: 16)
                    }
                    if showEnergy {
                        ForEach(Energy.allCases, id: \.self) { energy in
                            chip("\(energy.rawValue) energy", selected: energyFilter == energy) {
                                energyFilter = energyFilter == energy ? nil : energy
                            }
                        }
                    }
                }
            }
            .listRowBackground(Color.clear)
            .onChange(of: allTags) { restoreIfReady() }
            .onAppear { restoreIfReady() }
            .onChange(of: tagFilter) { persist() }
            .onChange(of: energyFilter) { persist() }
        }
    }

    private func restoreIfReady() {
        guard !restored, !allTags.isEmpty || showEnergy else { return }
        restored = true
        let defaults = UserDefaults.standard
        if let tag = defaults.string(forKey: "\(storageKey).tag"), allTags.contains(tag) {
            tagFilter = tag
        }
        if let raw = defaults.string(forKey: "\(storageKey).energy"),
            let energy = Energy(rawValue: raw)
        {
            energyFilter = energy
        }
    }

    private func persist() {
        guard restored else { return }
        let defaults = UserDefaults.standard
        defaults.set(tagFilter, forKey: "\(storageKey).tag")
        defaults.set(energyFilter?.rawValue, forKey: "\(storageKey).energy")
    }

    private func chip(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.caption)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    selected ? Color.indigo.opacity(0.18) : Color.secondary.opacity(0.08),
                    in: Capsule())
                .foregroundStyle(selected ? Color.indigo : Color.secondary)
        }
        .buttonStyle(.plain)
    }
}
