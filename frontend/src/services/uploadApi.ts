import { apiClient } from './apiClient';

// Legacy sync response (kept for backward compat fallback)
export interface IngestResponse {
  success: boolean;
  filename: string;
  row_count: number;
  columns: string[];
  preview: any[];
  parquet_path: string;
}

// New async job response — returned immediately, progress via WebSocket
export interface AsyncIngestResponse {
  job_id: string;
  status: 'PROCESSING';
  filename: string;
  file_size_mb?: number;
  eta_seconds?: number;
  // legacy fields present when backend falls back to sync
  row_count?: number;
  columns?: string[];
  preview?: any[];
  parquet_path?: string;
}

export interface CurateResponse {
  success: boolean;
  row_count: number;
  columns: string[];
  preview: any[];
  parquet_path: string;
}

export const uploadApi = {
  /**
   * Uploads raw chemical dataset. Returns job_id instantly.
   * All parsing progress streams via WebSocket JOB_COMPLETED.
   */
  ingestFile: async (file: File, clientId: string): Promise<AsyncIngestResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('client_id', clientId);

    const response = await apiClient.post<AsyncIngestResponse>('/api/ingest', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 15000,
    });
    return response.data;
  },

  /**
   * Drops user-specified metadata columns.
   */
  curateColumns: async (colsToDrop: string[], clientId: string): Promise<CurateResponse> => {
    const response = await apiClient.post<CurateResponse>('/api/curate', {
      client_id: clientId,
      columns_to_drop: colsToDrop,
    });
    return response.data;
  },
};
