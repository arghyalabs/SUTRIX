import { useState, useEffect, useCallback } from 'react';

export interface ColumnIntel {
  name: string;
  dtype: string;
  role: 'SMILES' | 'ENDPOINT' | 'DESCRIPTOR' | 'IDENTIFIER' | 'CATEGORICAL' | 'DATETIME' | 'UNKNOWN';
  health_score: number;
  missing_pct: number;
  unique_count: number;
  histogram: { x: number; count: number }[] | null;
  top_values: Record<string, number> | null;
}

export interface ColumnIntelligenceResult {
  columns: ColumnIntel[];
  role_counts: Record<string, number>;
  total_cols: number;
}

export const useColumnIntelligence = (clientId: string, apiBase: string) => {
  const [data, setData] = useState<ColumnIntelligenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIntel = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBase}/api/analytics/${clientId}/column-intelligence`);
      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.detail || 'Failed to fetch column intelligence');
      }
      setData(resData);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [clientId, apiBase]);

  useEffect(() => {
    if (clientId) {
      fetchIntel();
    }
  }, [clientId, fetchIntel]);

  const getByRole = useCallback((role: ColumnIntel['role']) => {
    if (!data) return [];
    return data.columns.filter(col => col.role === role);
  }, [data]);

  return {
    data,
    loading,
    error,
    refetch: fetchIntel,
    getByRole,
    columns: data?.columns || []
  };
};
