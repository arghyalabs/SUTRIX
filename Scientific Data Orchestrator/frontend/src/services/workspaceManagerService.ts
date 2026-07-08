/**
 * SUTRIX V6 — WorkspaceManagerService
 * Shared workspace manager.
 * All studios now share a SINGLE workspace and dataset.
 * Each studio tracks only its own progress within that shared workspace.
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

export interface StudioProgress {
  studioId: StudioId;
  status: 'pending' | 'in_progress' | 'completed';
  activeStep: string;
  lastActivity: number;
}

export interface StudioSnapshot {
  studioId: StudioId;
  workspaceId: string;
  schemaVersion: number;
  status: SessionStatus;
  createdAt: number;
  lastActivity: number;
  datasetCount: number;
  processingStatus: 'running' | 'idle';
  datasetFilename: string;
  parquetPath: string;
  rowCount: number;
  columns: string[];
  activeStep: string;
  studioState: any;
}

export interface SharedWorkspaceState {
  workspaceId: string;
  createdAt: number;
  lastActivity: number;
  datasetFilename: string;
  parquetPath: string;
  rowCount: number;
  columns: string[];
  studioProgress: Partial<Record<StudioId, StudioProgress>>;
}

const STORAGE_KEY = 'sutrix_v7_shared_workspace';
const SCHEMA_VERSION = 7;

class WorkspaceManagerService {
  private workspace: SharedWorkspaceState | null = null;

  constructor() {
    this.loadFromStorage();
  }

  // ─── Storage ────────────────────────────────────────────────────────────────

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: SharedWorkspaceState = JSON.parse(raw);
      if (parsed && parsed.workspaceId) {
        this.workspace = parsed;
      }
    } catch (e) {
      console.error('[WorkspaceManager] Failed to load workspace:', e);
    }
  }

  private persistToStorage(): void {
    try {
      if (this.workspace) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.workspace));
      }
    } catch (e) {
      console.error('[WorkspaceManager] Failed to persist workspace:', e);
    }
  }

  // ─── Workspace Lifecycle ─────────────────────────────────────────────────────

  createWorkspace(workspaceId: string): void {
    this.workspace = {
      workspaceId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      datasetFilename: '',
      parquetPath: '',
      rowCount: 0,
      columns: [],
      studioProgress: {},
    };
    this.persistToStorage();
    console.info(`[WorkspaceManager] Shared workspace created: ${workspaceId}`);
  }

  getWorkspace(): SharedWorkspaceState | null {
    return this.workspace;
  }

  getWorkspaceId(): string {
    return this.workspace?.workspaceId || '';
  }

  hasWorkspace(): boolean {
    return this.workspace !== null && this.workspace.workspaceId.length > 0;
  }

  setWorkspaceDataset(
    filename: string,
    parquetPath: string,
    rowCount: number,
    columns: string[]
  ): void {
    if (!this.workspace) return;
    this.workspace.datasetFilename = filename;
    this.workspace.parquetPath = parquetPath;
    this.workspace.rowCount = rowCount;
    this.workspace.columns = columns;
    this.workspace.lastActivity = Date.now();
    this.persistToStorage();
  }

  // ─── Studio Progress ────────────────────────────────────────────────────────

  getStudioProgress(studioId: StudioId): StudioProgress | undefined {
    return this.workspace?.studioProgress?.[studioId];
  }

  setStudioProgress(
    studioId: StudioId,
    status: 'pending' | 'in_progress' | 'completed',
    activeStep: string = ''
  ): void {
    if (!this.workspace) return;
    this.workspace.studioProgress = {
      ...this.workspace.studioProgress,
      [studioId]: {
        studioId,
        status,
        activeStep,
        lastActivity: Date.now(),
      },
    };
    this.workspace.lastActivity = Date.now();
    this.persistToStorage();
  }

  getActiveStudios(): StudioId[] {
    if (!this.workspace) return [];
    return (Object.entries(this.workspace.studioProgress) as [StudioId, StudioProgress][])
      .filter(([_, p]) => p.status === 'in_progress' || p.status === 'completed')
      .map(([id]) => id);
  }

  // ─── Snapshot (backward compat shim) ─────────────────────────────────────────

  getSnapshot(studioId: StudioId): any {
    const ws = this.workspace;
    if (!ws) {
      return {
        studioId,
        workspaceId: '',
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
      };
    }
    const progress = ws.studioProgress[studioId];
    return {
      studioId,
      workspaceId: ws.workspaceId,
      schemaVersion: SCHEMA_VERSION,
      status: progress ? 'active' : 'empty',
      createdAt: ws.createdAt,
      lastActivity: progress?.lastActivity || ws.lastActivity,
      datasetCount: ws.datasetFilename ? 1 : 0,
      processingStatus: progress?.status === 'in_progress' ? 'running' : 'idle',
      datasetFilename: ws.datasetFilename,
      parquetPath: ws.parquetPath,
      rowCount: ws.rowCount,
      columns: ws.columns,
      activeStep: progress?.activeStep || '',
      studioState: {},
    };
  }

  getAllSnapshots(): any[] {
    if (!this.workspace) return [];
    return (Object.keys(this.workspace.studioProgress) as StudioId[]).map(id =>
      this.getSnapshot(id)
    );
  }

  // ─── Legacy shim methods (keep for backward compat) ─────────────────────────

  saveWorkspaceState(studioId: StudioId, patch: any): void {
    if (!this.workspace) {
      const workspaceId = patch.workspaceId || `SDO_CORE_${Math.random().toString(36).substring(2, 9)}`;
      this.createWorkspace(workspaceId);
    }
    if (this.workspace) {
      if (patch.datasetFilename !== undefined) {
        this.workspace.datasetFilename = patch.datasetFilename || '';
      }
      if (patch.parquetPath !== undefined) {
        this.workspace.parquetPath = patch.parquetPath || '';
      }
      if (patch.rowCount !== undefined) {
        this.workspace.rowCount = patch.rowCount || 0;
      }
      if (patch.columns !== undefined) {
        this.workspace.columns = patch.columns || [];
      }

      let status = patch.status;
      if (status === 'active') {
        status = 'in_progress';
      }
      if (!status) {
        status = this.workspace.datasetFilename ? 'in_progress' : 'pending';
      }

      const activeStep = patch.activeStep || this.workspace.studioProgress[studioId]?.activeStep || '';

      this.workspace.studioProgress = {
        ...this.workspace.studioProgress,
        [studioId]: {
          studioId,
          status,
          activeStep,
          lastActivity: Date.now(),
        },
      };

      this.workspace.lastActivity = Date.now();
      this.persistToStorage();
    }
  }

  onMajorAction(_studioId: StudioId, _action: string, _statePatch?: any): void {
    if (import.meta.env.DEV) {
      console.debug('[WorkspaceManager] onMajorAction (shared mode):', _studioId, _action);
    }
  }

  pauseWorkspace(_studioId: StudioId): void {
    if (import.meta.env.DEV) {
      console.debug('[WorkspaceManager] pauseWorkspace (shared mode):', _studioId);
    }
  }

  restoreWorkspace(_studioId: StudioId): any {
    return this.getSnapshot(_studioId);
  }

  resetWorkspace(studioId: StudioId): void {
    // In shared mode, reset only the studio progress, not the whole workspace
    if (this.workspace) {
      const progress = { ...this.workspace.studioProgress };
      delete progress[studioId];
      this.workspace.studioProgress = progress;
      this.workspace.lastActivity = Date.now();
      this.persistToStorage();
    }
  }

  resetAllWorkspaces(): void {
    this.workspace = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  startAutoSave(_studioId: StudioId, _stateGetter: () => any): void {
    // Auto-save not needed in shared mode — state is persisted immediately
  }

  stopAutoSave(_studioId: StudioId): void {
    // No-op in shared mode
  }

  stopAllAutoSave(): void {
    // No-op in shared mode
  }
}

// Singleton
export const workspaceManager = new WorkspaceManagerService();
