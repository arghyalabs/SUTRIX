/**
 * SUTRIX V6 — WorkspaceManagerService
 * Manages N independent studio sessions using localStorage.
 * Each studio gets its own workspace_id, state snapshot, and lifecycle.
 */

export type StudioId =
  | 'hierarchy'
  | 'analytics'
  | 'compound'
  | 'normalization'
  | 'qsar'
  | 'intelligence'
  | 'oecd';

export type SessionStatus = 'active' | 'paused' | 'empty';

export interface StudioSnapshot {
  studioId: StudioId;
  workspaceId: string;         // e.g. 'HIER_abc123'
  schemaVersion: number;       // for migration safety
  status: SessionStatus;
  createdAt: number;           // Unix ms timestamp
  lastActivity: number;        // Unix ms timestamp
  datasetCount: number;        // how many datasets loaded
  processingStatus: 'idle' | 'running' | 'error';
  datasetFilename: string;
  parquetPath: string;
  rowCount: number;
  columns: string[];
  activeStep: string;
  studioState: Record<string, any>;  // studio-specific state blob
}

const STORAGE_KEY = 'sutrix_v6_studio_sessions';
const SCHEMA_VERSION = 6;

// Major actions that trigger an auto-save
export const MAJOR_ACTIONS = [
  'upload_dataset',
  'build_hierarchy',
  'select_subgroup',
  'run_enrichment',
  'generate_descriptors',
  'run_readiness',
  'generate_dataset',
  'run_normalization',
  'run_benchmark',
] as const;
export type MajorAction = typeof MAJOR_ACTIONS[number];

const DEFAULT_SNAPSHOT = (studioId: StudioId): StudioSnapshot => ({
  studioId,
  workspaceId: `${studioId.toUpperCase().slice(0, 4)}_${Math.random().toString(36).substring(2, 9)}`,
  schemaVersion: SCHEMA_VERSION,
  status: 'empty',
  createdAt: Date.now(),
  lastActivity: Date.now(),
  datasetCount: 0,
  processingStatus: 'idle',
  datasetFilename: '',
  parquetPath: '',
  rowCount: 0,
  columns: [],
  activeStep: '',
  studioState: {},
});

class WorkspaceManagerService {
  private sessions: Record<StudioId, StudioSnapshot> = {} as any;
  private autoSaveTimers: Record<StudioId, ReturnType<typeof setInterval>> = {} as any;

  constructor() {
    this.loadFromStorage();
  }

  // ─── Storage ────────────────────────────────────────────────────────────────

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: Record<string, StudioSnapshot> = JSON.parse(raw);
      // Validate schema version — hard wipe if schema mismatch
      for (const [id, snap] of Object.entries(parsed)) {
        if (snap.schemaVersion !== SCHEMA_VERSION) {
          console.warn(`[WorkspaceManager] Schema mismatch for ${id}, wiping.`);
          continue;
        }
        // Mark any previously 'active' sessions as 'paused' (browser was closed)
        if (snap.status === 'active') snap.status = 'paused';
        this.sessions[id as StudioId] = snap;
      }
    } catch (e) {
      console.error('[WorkspaceManager] Failed to load sessions:', e);
    }
  }

  private persistToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.sessions));
    } catch (e) {
      console.error('[WorkspaceManager] Failed to persist sessions:', e);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  getSnapshot(studioId: StudioId): StudioSnapshot {
    if (!this.sessions[studioId]) {
      this.sessions[studioId] = DEFAULT_SNAPSHOT(studioId);
    }
    return this.sessions[studioId];
  }

  getAllSnapshots(): StudioSnapshot[] {
    return Object.values(this.sessions);
  }

  getActiveStudios(): StudioId[] {
    return Object.values(this.sessions)
      .filter(s => s.status !== 'empty')
      .map(s => s.studioId);
  }

  /**
   * Save a patch to a studio's snapshot.
   * Marks status as 'active' and updates lastActivity.
   */
  saveWorkspaceState(studioId: StudioId, patch: Partial<StudioSnapshot>): void {
    const current = this.getSnapshot(studioId);
    this.sessions[studioId] = {
      ...current,
      ...patch,
      studioId,
      schemaVersion: SCHEMA_VERSION,
      status: 'active',
      lastActivity: Date.now(),
    };
    this.persistToStorage();
  }

  /**
   * Called after a major action — saves state and updates processingStatus.
   */
  onMajorAction(studioId: StudioId, action: MajorAction, statePatch?: Partial<StudioSnapshot>): void {
    console.info(`[WorkspaceManager] Major action: ${action} in studio ${studioId}`);
    this.saveWorkspaceState(studioId, {
      processingStatus: 'idle',
      ...statePatch,
    });
  }

  /**
   * Pause a studio — marks it as paused, stops auto-save, persists.
   */
  pauseWorkspace(studioId: StudioId): void {
    const snap = this.getSnapshot(studioId);
    this.sessions[studioId] = { ...snap, status: 'paused', lastActivity: Date.now() };
    this.persistToStorage();
    this.stopAutoSave(studioId);
    console.info(`[WorkspaceManager] Studio ${studioId} paused.`);
  }

  /**
   * Restore a paused/active studio — returns snapshot or null if empty.
   */
  restoreWorkspace(studioId: StudioId): StudioSnapshot | null {
    const snap = this.sessions[studioId];
    if (!snap || snap.status === 'empty') return null;
    // Mark as active again
    this.sessions[studioId] = { ...snap, status: 'active', lastActivity: Date.now() };
    this.persistToStorage();
    return this.sessions[studioId];
  }

  /**
   * Reset a studio — clears all state, resets to empty.
   */
  resetWorkspace(studioId: StudioId): void {
    this.stopAutoSave(studioId);
    this.sessions[studioId] = DEFAULT_SNAPSHOT(studioId);
    this.persistToStorage();
    console.info(`[WorkspaceManager] Studio ${studioId} reset.`);
  }

  resetAllWorkspaces(): void {
    const studioIds: StudioId[] = ['hierarchy', 'analytics', 'compound', 'normalization', 'qsar', 'intelligence', 'oecd'];
    studioIds.forEach(id => this.resetWorkspace(id));
  }

  // ─── Auto-Save ──────────────────────────────────────────────────────────────

  /**
   * Start 30-second background auto-save for a studio.
   * stateGetter is called each interval to get current state.
   */
  startAutoSave(studioId: StudioId, stateGetter: () => Partial<StudioSnapshot>): void {
    this.stopAutoSave(studioId);
    this.autoSaveTimers[studioId] = setInterval(() => {
      const state = stateGetter();
      if (Object.keys(state).length > 0) {
        this.saveWorkspaceState(studioId, state);
      }
    }, 30_000);
  }

  stopAutoSave(studioId: StudioId): void {
    if (this.autoSaveTimers[studioId]) {
      clearInterval(this.autoSaveTimers[studioId]);
      delete this.autoSaveTimers[studioId];
    }
  }

  stopAllAutoSave(): void {
    Object.keys(this.autoSaveTimers).forEach(id => this.stopAutoSave(id as StudioId));
  }
}

// Singleton
export const workspaceManager = new WorkspaceManagerService();
