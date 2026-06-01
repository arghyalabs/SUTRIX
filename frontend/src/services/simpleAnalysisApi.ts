import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export interface SimpleFunnelStep {
  step: number;
  id: string;
  label: string;
  filter_col: string | null;
  filter_val: string | null;
  row_count: number;
  unique_compounds: number;
  pct_retained: number;
  charts: any;
}

export interface SimpleFunnelData {
  steps: SimpleFunnelStep[];
  sankey_links: Array<{ source: string; target: string; value: number }>;
}

export const simpleAnalysisApi = {
  getFunnel: async (clientId: string): Promise<SimpleFunnelData> => {
    const res = await axios.get(`${BASE_URL}/api/analysis/simple/${clientId}/funnel`);
    return res.data;
  },
  getStepCharts: async (clientId: string, nodeId: string): Promise<any> => {
    const res = await axios.get(`${BASE_URL}/api/analysis/simple/${clientId}/charts/${nodeId}`);
    return res.data;
  },
  exportChart: (clientId: string, nodeId: string, format: string) => {
    window.open(`${BASE_URL}/api/hierarchy/${clientId}/export/${nodeId}?format=${format}`, '_blank');
  }
};
