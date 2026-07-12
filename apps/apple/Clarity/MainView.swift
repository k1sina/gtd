import ClarityKit
import SwiftUI

enum AppSection: String, CaseIterable, Identifiable {
    case assistant, inbox, next, scheduled, waiting, someday
    case habits
    case reviews, goals
    case search, settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .assistant: return "Assistant"
        case .inbox: return "Inbox"
        case .next: return "Next actions"
        case .scheduled: return "Scheduled"
        case .waiting: return "Waiting for"
        case .someday: return "Someday/maybe"
        case .habits: return "Habits"
        case .reviews: return "Reviews"
        case .goals: return "Goals & values"
        case .search: return "Search"
        case .settings: return "Settings"
        }
    }

    var systemImage: String {
        switch self {
        case .assistant: return "sparkles"
        case .inbox: return "tray"
        case .next: return "arrow.right.circle"
        case .scheduled: return "calendar"
        case .waiting: return "hourglass"
        case .someday: return "moon.zzz"
        case .habits: return "flame"
        case .reviews: return "checklist"
        case .goals: return "scope"
        case .search: return "magnifyingglass"
        case .settings: return "gearshape"
        }
    }

    /// Sidebar groups following the GTD loop, mirroring the web sidebar:
    /// engage first, then capture, then the parked/upcoming lists, then
    /// reflection. Search sits next to the space switcher up top; Settings
    /// closes the sidebar. Assistant is hidden for now — the user drives
    /// Clarity through Claude via MCP instead; add `.assistant` back here
    /// (and in `browse`) to restore it.
    static let groups: [(title: String?, sections: [AppSection])] = [
        (nil, [.next]),
        ("Capture", [.inbox]),
        ("Upcoming & parked", [.scheduled, .waiting, .someday, .habits]),
        ("Reflect", [.reviews, .goals]),
        (nil, [.settings]),
    ]

    /// iOS: sections that live in the Browse tab rather than the tab bar.
    /// Search leads — it was buried at the bottom before.
    static let browse: [AppSection] = [
        .search, .scheduled, .waiting, .someday, .habits,
        .reviews, .goals,
    ]
}

struct MainView: View {
    @Environment(AppSession.self) private var session
    @State private var section: AppSection = .next
    @State private var inboxCount = 0

    var body: some View {
        #if os(macOS)
        NavigationSplitView {
            List(selection: sidebarSelection) {
                ForEach(AppSection.groups, id: \.sections.first) { group in
                    Section(group.title ?? "") {
                        ForEach(group.sections) { section in
                            Label(section.title, systemImage: section.systemImage)
                                .badge(section == .inbox && inboxCount > 0 ? inboxCount : 0)
                                .tag(section)
                        }
                    }
                }
            }
            .navigationSplitViewColumnWidth(min: 190, ideal: 210)
            .safeAreaInset(edge: .top) {
                HStack(spacing: 4) {
                    SpaceSwitcherMenu()
                    Button {
                        section = .search
                    } label: {
                        Image(systemName: "magnifyingglass")
                    }
                    .buttonStyle(.borderless)
                    .help("Search")
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
            }
        } detail: {
            NavigationStack { sectionView(section) }
                .id(session.dataEpoch)
        }
        .task(id: session.dataEpoch) { session.startRealtime() }
        .task(id: session.reloadKey) { await refreshInboxCount() }
        #else
        TabView(selection: $section) {
            tab(.next)
            tab(.inbox)
            NavigationStack { BrowseView() }
                .tabItem { Label("Browse", systemImage: "square.grid.2x2") }
                .tag(AppSection.search) // any non-tab section selects Browse
            tab(.settings)
        }
        .id(session.dataEpoch)
        .task(id: session.dataEpoch) { session.startRealtime() }
        #endif
    }

    #if os(macOS)
    private var sidebarSelection: Binding<AppSection?> {
        Binding(get: { section }, set: { section = $0 ?? .next })
    }

    private func refreshInboxCount() async {
        guard let ctx = try? session.requireContext() else { return }
        inboxCount = (try? await TaskRepository(ctx).inboxCount()) ?? 0
    }
    #else
    private func tab(_ section: AppSection) -> some View {
        NavigationStack { sectionView(section) }
            .tabItem { Label(section.title, systemImage: section.systemImage) }
            .tag(section)
    }
    #endif
}

/// Where each section's screen lives; shared by the macOS sidebar and the
/// iOS Browse tab.
@ViewBuilder
func sectionView(_ section: AppSection) -> some View {
    switch section {
    case .assistant: AssistantView()
    case .inbox: InboxView()
    case .next: NextView()
    case .scheduled: ScheduledView()
    case .waiting: WaitingView()
    case .someday: SomedayView()
    case .habits: HabitsView()
    case .reviews: ReviewsHubView()
    case .goals: GoalsView()
    case .search: SearchView()
    case .settings: SettingsView()
    }
}

#if os(iOS)
/// Everything that doesn't fit in the tab bar, mirroring the web sidebar.
struct BrowseView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        List(AppSection.browse) { section in
            NavigationLink(value: section) {
                Label(section.title, systemImage: section.systemImage)
            }
        }
        .navigationTitle("Browse")
        .navigationDestination(for: AppSection.self) { section in
            sectionView(section)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { SpaceSwitcherMenu() }
        }
    }
}
#endif
