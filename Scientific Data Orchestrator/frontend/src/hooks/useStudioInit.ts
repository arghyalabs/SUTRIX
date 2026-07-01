/**
 * useStudioInit — per-studio lifecycle hook.
 *
 * Each V6 studio calls this on mount.  If the WorkspaceManager snapshot for
 * that studio is still "empty" (i.e. first-ever open, or after a reset) the
 * global useWorkspaceStore is wiped so stale data from the E2E test-runner,
 * a previously used studio, or a leftover session can never bleed through.
 *
 * If the snapshot is "paused" or "active" the store is left intact so the
 * user can genuinely resume their work.
 */
import { useEffect, useRef } from 'react';
import { workspaceManager } from '../services/workspaceManagerService';
import type { StudioId } from '../services/workspaceManagerService';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { workspaceApi } from '../services/workspaceApi';

export function useStudioInit(studioId: StudioId) {
  const initialised = useRef(false);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    const snap = workspaceManager.getSnapshot(studioId);
    const store = useWorkspaceStore.getState();

    // Verify session integrity on backend
    const verifyActiveSession = async (wsId: string) => {
      try {
        const res = await workspaceApi.verifyWorkspace(wsId);
        if (!res.valid) {
          console.warn(`[useStudioInit] Backend session ${wsId} is missing or invalid. Wiping local state.`);
          workspaceManager.resetWorkspace(studioId);
          const activeStore = useWorkspaceStore.getState();
          activeStore.resetWorkspace();
          activeStore.setCurrentStudioId(studioId);
          activeStore.setActiveTab('ingest');
        }
      } catch (e) {
        console.error('[useStudioInit] Failed to verify backend session:', e);
      }
    };

    // Fresh open -> wipe global store
    if (snap.status === 'empty') {
      store.resetWorkspace();
      useWorkspaceStore.getState().setCurrentStudioId(studioId);
    } else if (store.currentStudioId && store.currentStudioId !== studioId) {
      // Navigating from a different studio -> restore the target studio's snapshot state
      store.resetWorkspace();
      const state = useWorkspaceStore.getState();
      state.setCurrentStudioId(studioId);
      
      if (snap.studioState && Object.keys(snap.studioState).length > 0) {
        useWorkspaceStore.setState({
          ...snap.studioState,
          currentStudioId: studioId,
        });
      } else {
        // Fallback for older snapshots
        state.setWorkspaceId(snap.workspaceId);
        if (snap.datasetFilename) {
          state.setDataset(
            snap.datasetFilename,
            snap.parquetPath || '',
            snap.rowCount || 0,
            snap.columns || [],
            []
          );
        }
      }
    } else if (!store.currentStudioId) {
      store.setCurrentStudioId(studioId);
    }

    if (snap.status !== 'empty' && snap.workspaceId) {
      verifyActiveSession(snap.workspaceId);
    }

    // Mark the studio as active in the session registry
    workspaceManager.saveWorkspaceState(studioId, {
      status: 'active',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);   // intentionally runs once on mount only
}

