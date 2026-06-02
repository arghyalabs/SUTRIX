import { apiClient } from './apiClient';
import type { ModelingAnalysis, FeatureSelectionRequest, FeatureSelectionResponse } from '../types';

export const modelingApi = {
  runAnalysis: async (clientId: string, subgroupNodeIds?: string[]): Promise<ModelingAnalysis> => {
    const payload: any = { client_id: clientId };
    if (subgroupNodeIds && subgroupNodeIds.length > 0) {
      payload.subgroup_ids = subgroupNodeIds;
    }
    const { data } = await apiClient.post('/api/modeling/analyze', payload);
    return data;
  },

  getResults: async (clientId: string): Promise<ModelingAnalysis> => {
    const { data } = await apiClient.get(`/api/modeling/${clientId}/results`);
    return data;
  },

  exportReport: async (clientId: string, format: 'json' | 'csv' | 'xlsx'): Promise<Blob> => {
    const { data } = await apiClient.post(
      `/api/modeling/${clientId}/export?format=${format}`,
      {},
      { responseType: 'blob' }
    );
    return data;
  },

  getEmbedding: async (clientId: string): Promise<any> => {
    const { data } = await apiClient.get(`/api/modeling/${clientId}/embedding`);
    return data;
  },

  runFeatureSelection: async (request: FeatureSelectionRequest): Promise<FeatureSelectionResponse> => {
    const { data } = await apiClient.post('/api/modeling/feature-selection/run', request);
    return data;
  }
};
