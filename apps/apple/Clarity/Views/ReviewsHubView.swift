import ClarityCore
import ClarityKit
import SwiftUI

/// Reviews hub: weekly + quarterly cards, weekly streak, recent history —
/// mirrors the web review page.
struct ReviewsHubView: View {
    @Environment(AppSession.self) private var session
    @State private var reviews: [Review] = []
    @State private var error: String?

    private var now: Date { Date() }
    private var completed: [Review] { reviews.filter { $0.completedAt != nil } }

    private var weeklyDone: Set<String> {
        Set(completed.filter { $0.type == .weekly }.map(\.periodStart))
    }

    private var doneThisWeek: Bool {
        weeklyDone.contains(weekPeriod(for: now).start)
    }

    private var doneThisQuarter: Bool {
        let (year, quarter) = quarterOf(now)
        return completed.contains {
            $0.type == .quarterly && $0.periodStart == quarterPeriod(year: year, quarter: quarter).start
        }
    }

    private var streak: Int {
        weeklyReviewStreak(completedPeriodStarts: weeklyDone, now: now)
    }

    var body: some View {
        List {
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            Section {
                NavigationLink {
                    WeeklyReviewView { await load() }
                } label: {
                    reviewCard(
                        title: "Weekly review",
                        subtitle: doneThisWeek
                            ? "Done this week — see you next Monday."
                            : "Get current: inbox zero, project check, week priorities.",
                        systemImage: "calendar.badge.checkmark",
                        done: doneThisWeek)
                }
                NavigationLink {
                    QuarterlyReviewView { await load() }
                } label: {
                    reviewCard(
                        title: "Quarterly review",
                        subtitle: doneThisQuarter
                            ? "Done this quarter."
                            : "Score your goals and set the next quarter's.",
                        systemImage: "scope",
                        done: doneThisQuarter)
                }
            } footer: {
                if streak > 0 {
                    Label("\(streak) week streak", systemImage: "flame.fill")
                        .foregroundStyle(.orange)
                }
            }
            if !completed.isEmpty {
                Section("History") {
                    ForEach(completed.prefix(12)) { review in
                        HStack {
                            Image(systemName: review.type == .weekly ? "calendar" : "scope")
                                .foregroundStyle(.secondary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(review.type == .weekly ? "Weekly" : "Quarterly")
                                Text("\(review.periodStart) – \(review.periodEnd)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if let notes = review.notes, !notes.isEmpty {
                                Image(systemName: "note.text").foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Reviews")
        .refreshable { await load() }
        .task(id: session.dataEpoch) { await load() }
    }

    private func reviewCard(title: String, subtitle: String, systemImage: String, done: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: done ? "checkmark.seal.fill" : systemImage)
                .font(.title3)
                .foregroundStyle(done ? .green : .indigo)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            reviews = try await ReviewRepository(ctx).reviews()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
