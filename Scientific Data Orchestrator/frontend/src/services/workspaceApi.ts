import { apiClient } from './apiClient';

export interface TelemetryResponse {
  ram_usage_pct: number;
  cpu_usage_pct: number;
  cache_hit_rate_pct: number;
  total_cached_compounds: number;
  active_jobs_count: number;
  active_workspaces: number;
}

// New async job response shape returned by /api/demo_ingest and /api/ingest
export interface AsyncJobResponse {
  job_id: string;
  status: 'PROCESSING';
  filename: string;
  file_size_mb?: number;
  eta_seconds?: number;
}

export const workspaceApi = {
  /**
   * Pre-seeds active user workspace with standard toxicology benchmark data.
   * Returns job_id immediately — progress streams via WebSocket.
   */
  loadDemoDataset: async (clientId: string): Promise<AsyncJobResponse> => {
    const formData = new FormData();
    formData.append('client_id', clientId);

    const response = await apiClient.post<AsyncJobResponse>('/api/demo_ingest', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /**
   * Retrieves host telemetry diagnostics (memory shielding, worker logs, workspace size).
   */
  getTelemetry: async (abortSignal?: AbortSignal): Promise<TelemetryResponse> => {
    const response = await apiClient.get<TelemetryResponse>('/api/telemetry', {
      signal: abortSignal,
    });
    return response.data;
  },

  /**
   * Resets and deletes the active workspace session files on the backend.
   */
  resetWorkspace: async (clientId: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete<{ success: boolean; message: string }>(`/api/workspace/${clientId}/reset`);
    return response.data;
  },
};

