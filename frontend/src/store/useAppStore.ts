import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StudioId, StudioSnapshot } from '../services/workspaceManagerService';
import { workspaceManager } from '../services/workspaceManagerService';

// ─── App-level routing state (not persisted — derived on load) ───────────────
export type AppView = 'landing' | 'hub' | 'studio';

interface AppState {
  // Top-level view
  appView: AppView;
  activeStudio: StudioId | null;

  // Per-studio active tab (step within that studio)
  studioTabs: Partial<Record<StudioId, string>>;

  // Actions
  setAppView: (v: AppView) => void;
  setActiveStudio: (id: StudioId | null) => void;
  setStudioTab: (studioId: StudioId, tab: string) => void;
  getStudioTab: (studioId: StudioId, defaultTab: string) => string;

  // Workspace manager bridge
  pauseStudio: (studioId: StudioId) => void;
  resetStudio: (studioId: StudioId) => void;
  getStudioSnapshot: (studioId: StudioId) => StudioSnapshot;

  // Legacy compat shim — for components not yet migrated
  activeTab: string;
  setActiveTab: (tab: string) => void;
  workspaceId: string;
  setWorkspaceId: (id: string) => void;
  resetWorkspace: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      appView: 'landing',
      activeStudio: null,
      studioTabs: {},

      setAppView: (v) => set({ appView: v }),
      setActiveStudio: (id) => set({ activeStudio: id }),
      setStudioTab: (studioId, tab) =>
        set(state => ({
          studioTabs: { ...state.studioTabs, [studioId]: tab },
          activeTab: tab, // keep legacy shim in sync
        })),
      getStudioTab: (studioId, defaultTab) => {
        return get().studioTabs[studioId] ?? defaultTab;
      },

      pauseStudio: (studioId) => {
        workspaceManager.pauseWorkspace(studioId);
      },
      resetStudio: (studioId) => {
        workspaceManager.resetWorkspace(studioId);
      },
      getStudioSnapshot: (studioId) => {
        return workspaceManager.getSnapshot(studioId);
      },

      // ── Legacy shim ──────────────────────────────────────────────
      activeTab: 'ingest',
      setActiveTab: (tab) => {
        const { activeStudio } = get();
        if (activeStudio) {
          set(state => ({
            activeTab: tab,
            studioTabs: { ...state.studioTabs, [activeStudio]: tab },
          }));
        } else {
          set({ activeTab: tab });
        }
      },
      workspaceId: '',
      setWorkspaceId: (id) => set({ workspaceId: id }),
      resetWorkspace: () => {
        const { activeStudio } = get();
        if (activeStudio) workspaceManager.resetWorkspace(activeStudio);
        set({ activeTab: 'ingest' });
      },
    }),
    {
      name: 'sutrix-v6-app-state',
      version: 6,
      migrate: (_persisted: any, version: number) => {
        if (version < 6) {
          // One-time migration: wipe old v4/v5 state
          console.info('[AppStore] Migrating from v' + version + ' → v6, resetting app view state.');
          return {
            appView: 'landing',
            activeStudio: null,
            studioTabs: {},
            activeTab: 'ingest',
            workspaceId: '',
          };
        }
        return _persisted;
      },
      // Only persist routing state, not ephemeral studio data
      partialize: (state) => ({
        appView: state.appView,
        activeStudio: state.activeStudio,
        studioTabs: state.studioTabs,
        activeTab: state.activeTab,
        workspaceId: state.workspaceId,
      }),
    }
  )
);
