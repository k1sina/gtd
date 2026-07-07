import ClarityKit
import SwiftUI

enum AppSection: String, CaseIterable, Identifiable {
    case today, inbox, next, projects

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: return "Today"
        case .inbox: return "Inbox"
        case .next: return "Next"
        case .projects: return "Projects"
        }
    }

    var systemImage: String {
        switch self {
        case .today: return "sun.max"
        case .inbox: return "tray"
        case .next: return "arrow.right.circle"
        case .projects: return "folder"
        }
    }
}

struct MainView: View {
    @Environment(AppSession.self) private var session
    @State private var section: AppSection = .today

    var body: some View {
        #if os(macOS)
        NavigationSplitView {
            List(AppSection.allCases, selection: sidebarSelection) { section in
                Label(section.title, systemImage: section.systemImage)
                    .tag(section)
            }
            .navigationSplitViewColumnWidth(min: 170, ideal: 190)
            .safeAreaInset(edge: .bottom) {
                Button("Sign out") { Task { await session.signOut() } }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .font(.footnote)
                    .padding(.bottom, 10)
            }
        } detail: {
            content
        }
        #else
        TabView(selection: $section) {
            ForEach(AppSection.allCases) { section in
                NavigationStack { sectionView(section) }
                    .tabItem { Label(section.title, systemImage: section.systemImage) }
                    .tag(section)
            }
        }
        #endif
    }

    #if os(macOS)
    private var sidebarSelection: Binding<AppSection?> {
        Binding(get: { section }, set: { section = $0 ?? .today })
    }

    private var content: some View {
        NavigationStack { sectionView(section) }
    }
    #endif

    @ViewBuilder
    private func sectionView(_ section: AppSection) -> some View {
        switch section {
        case .today: TodayView()
        case .inbox: InboxView()
        case .next: NextView()
        case .projects: ProjectsView()
        }
    }
}
