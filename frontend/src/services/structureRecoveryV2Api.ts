import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export interface StructureRecoveryEstimate {
  unique_compounds: number;
  cached_already: number;
  to_fetch: number;
  estimates_per_source: Record<string, {
    rate_per_min: number;
    estimated_minutes: number;
    estimated_display: string;
  }>;
}

export const structureRecoveryV2Api = {
  startRecovery: async (clientId: string, column: string, mode: string, limit: number, sources: string[]) => {
    const res = await axios.post(`${BASE_URL}/api/structure-recovery/v2/start`, {
      client_id: clientId,
      column_to_resolve: column,
      mode,
      limit,
      sources
    });
    return res.data;
  },
  estimate: async (clientId: string, column: string, sources: string[]): Promise<StructureRecoveryEstimate> => {
    const res = await axios.post(`${BASE_URL}/api/structure-recovery/v2/estimate`, {
      client_id: clientId,
      column_to_resolve: column,
      sources
    });
    return res.data;
  },
  getStatus: async (clientId: string) => {
    const res = await axios.get(`${BASE_URL}/api/structure-recovery/v2/${clientId}/status`);
    return res.data;
  },
  getCacheStats: async () => {
    const res = await axios.get(`${BASE_URL}/api/structure-recovery/cache/stats`);
    return res.data;
  }
};
