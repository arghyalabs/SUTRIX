import { apiClient } from './apiClient';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export interface SchemaInference {
  column: string;
  mapped_to: string;
  confidence: number;
  reasons: string[];
  layer_reached?: number;
  needs_user_confirmation?: boolean;
  alternatives?: Array<{ mapped_to: string; confidence: number; matched_alias: string }>;
  ecotox?: any;
}

export interface SchemaInferResponse {
  mappings: SchemaInference[];
}

export interface SaveMappingResponse {
  success: boolean;
  mappings: Record<string, string>;
  columns: string[];
  dataset_type?: string;
  warnings?: string[];
  dataset_mode?: 'MOLECULAR' | 'SCIENTIFIC' | 'HYBRID';
  dataset_classification?: any;
  dataset_passport?: any;
}

export const mappingApi = {
  /**
   * Dispatches column list to AI inference engine.
   */
  inferSchema: async (columns: string[], abortSignal?: AbortSignal): Promise<SchemaInferResponse> => {
    const clientId = useWorkspaceStore.getState().workspaceId;
    const response = await apiClient.post<SchemaInferResponse>('/api/schema/infer', {
      columns,
      client_id: clientId,
    }, { signal: abortSignal });
    return response.data;
  },

  /**
   * Confirms and applies chemical variable mapping schemas.
   */
  saveMappings: async (mappings: Record<string, string>, clientId: string): Promise<SaveMappingResponse> => {
    const response = await apiClient.post<SaveMappingResponse>('/api/mapping', {
      client_id: clientId,
      mappings,
    });
    return response.data;
  },
};
