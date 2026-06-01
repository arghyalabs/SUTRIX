import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CompoundPreviewRow, VariableMappings, ReadinessResponse, ModelingAnalysis, DatasetMode, DatasetClassification, DatasetPassport } from '../types';

interface WorkspaceState {
  // Navigation
  inWorkspace: boolean;
  activeTab: string;

  // Pipeline Dataset
  workspaceId: string;
  filename: string;
  parquetPath: string;
  rowCount: number;
  columns: string[];
  preview: CompoundPreviewRow[];

  // Mappings
  mappings: VariableMappings;
  mappingIntelligence: Record<string, { confidence: number; reasons: string[]; ecotox?: any }>;

  // Segregation / Hierarchy
  segStats: any;
  segregationExecuted: boolean;
  activeSegregationResult: any;
  activeLineage: any;
  activeNodeId: string;
  activeNodeDetail: any;
  filterNodes: any[];

  // Enrichment
  enrichmentMode: 'fast' | 'standard' | 'full';
  includeMordred: boolean;
  selectedDescriptors: string[];
  activeJobId: string;
  activeJobType: 'segregation' | 'enrichment' | 'recovery_v2' | null;

  // Readiness (legacy)
  readiness: ReadinessResponse | null;
  readinessLoading: boolean;

  // Modeling Readiness Workspace
  modelingAnalysis: ModelingAnalysis | null;
  modelingLoading: boolean;
  modelingActivePanel: string;

  // Dataset Intelligence
  datasetMode: DatasetMode;
  datasetClassification: DatasetClassification | null;
  datasetPassport: DatasetPassport | null;
  detectedDomain: string;
  primaryEntityType: string;

  // Simple / Advanced Dual Analysis Mode
  analysisMode: 'simple' | 'advanced';
  simpleFunnelData: any | null;

  // Zero-Mapping & Recoverable Modes
  genericMode: boolean;
  genericModeReason: string;
  recoverableMode: boolean;
  genericBannerDismissed: boolean;

  // Variance Filtering
  varianceFilterEnabled: boolean;
  varianceSummary: any | null;

  // Setters
  setWorkspaceId: (id: string) => void;
  setInWorkspace: (inWS: boolean) => void;
  setActiveTab: (tab: string) => void;
  setDataset: (filename: string, parquetPath: string, rowCount: number, columns: string[], preview: CompoundPreviewRow[]) => void;
  setMappings: (mappings: VariableMappings) => void;
  setMappingIntelligence: (intel: Record<string, { confidence: number; reasons: string[]; ecotox?: any }>) => void;
  setSegregation: (stats: any, executed: boolean) => void;
  setActiveSegregationResult: (res: any) => void;
  setActiveLineage: (lineage: any) => void;
  setActiveNodeId: (id: string) => void;
  setActiveNodeDetail: (detail: any) => void;
  setFilterNodes: (nodes: any[]) => void;
  setEnrichmentMode: (mode: 'fast' | 'standard' | 'full') => void;
  setIncludeMordred: (include: boolean) => void;
  setSelectedDescriptors: (descriptors: string[]) => void;
  setActiveJobId: (jobId: string) => void;
  setActiveJobType: (type: 'segregation' | 'enrichment' | 'recovery_v2' | null) => void;
  setReadiness: (readiness: ReadinessResponse | null) => void;
  setReadinessLoading: (loading: boolean) => void;
  setModelingAnalysis: (data: ModelingAnalysis | null) => void;
  setModelingLoading: (loading: boolean) => void;
  setModelingActivePanel: (panel: string) => void;
  setDatasetMode: (mode: DatasetMode) => void;
  setDatasetClassification: (c: DatasetClassification | null) => void;
  setDatasetPassport: (p: DatasetPassport | null) => void;
  setDetectedDomain: (domain: string) => void;
  setPrimaryEntityType: (entity: string) => void;

  setAnalysisMode: (mode: 'simple' | 'advanced') => void;
  setSimpleFunnelData: (data: any | null) => void;
  setGenericMode: (enabled: boolean, reason?: string) => void;
  setRecoverableMode: (enabled: boolean) => void;
  setGenericBannerDismissed: (dismissed: boolean) => void;
  setVarianceFilterEnabled: (enabled: boolean) => void;
  setVarianceSummary: (summary: any | null) => void;

  resetWorkspace: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      inWorkspace: false,
      activeTab: 'ingest',

      workspaceId: '',
      filename: '',
      parquetPath: '',
      rowCount: 0,
      columns: [],
      preview: [],

      mappings: {},
      mappingIntelligence: {},

      segStats: {},
      segregationExecuted: false,
      activeSegregationResult: null,
      activeLineage: null,
      activeNodeId: '',
      activeNodeDetail: null,
      filterNodes: [],

      enrichmentMode: 'fast',
      includeMordred: false,
      selectedDescriptors: [],
      activeJobId: '',
      activeJobType: null,

      readiness: null,
      readinessLoading: false,

      modelingAnalysis: null,
      modelingLoading: false,
      modelingActivePanel: 'overview',

      datasetMode: 'MOLECULAR',
      datasetClassification: null,
      datasetPassport: null,
      detectedDomain: 'General Scientific',
      primaryEntityType: 'Compound',

      analysisMode: 'simple',
      simpleFunnelData: null,

      genericMode: false,
      genericModeReason: 'No scientific column mapping was detected or confirmed.',
      recoverableMode: false,
      genericBannerDismissed: false,

      varianceFilterEnabled: true,
      varianceSummary: null,

      setWorkspaceId: (id) => set({ workspaceId: id }),
      setInWorkspace: (inWS) => set({ inWorkspace: inWS }),
      setActiveTab: (tab) => {
        if (typeof window !== 'undefined' && window.location.hash !== `#${tab}`) {
          window.history.pushState(null, '', `#${tab}`);
        }
        set({ activeTab: tab });
      },
      setDataset: (filename, parquetPath, rowCount, columns, preview) =>
        set({ filename, parquetPath, rowCount, columns, preview }),
      setMappings: (mappings) => set({ mappings }),
      setMappingIntelligence: (intel) => set({ mappingIntelligence: intel }),
      setSegregation: (stats, executed) => set({ segStats: stats, segregationExecuted: executed }),
      setActiveSegregationResult: (res) => set({ activeSegregationResult: res }),
      setActiveLineage: (lineage) => set({ activeLineage: lineage }),
      setActiveNodeId: (id) => set({ activeNodeId: id }),
      setActiveNodeDetail: (detail) => set({ activeNodeDetail: detail }),
      setFilterNodes: (nodes) => set({ filterNodes: nodes }),
      setEnrichmentMode: (mode) => set({ enrichmentMode: mode }),
      setIncludeMordred: (include) => set({ includeMordred: include }),
      setSelectedDescriptors: (descriptors) => set({ selectedDescriptors: descriptors }),
      setActiveJobId: (jobId) => set({ activeJobId: jobId }),
      setActiveJobType: (type) => set({ activeJobType: type }),
      setReadiness: (readiness) => set({ readiness }),
      setReadinessLoading: (loading) => set({ readinessLoading: loading }),
      setModelingAnalysis: (data) => set({ modelingAnalysis: data }),
      setModelingLoading: (loading) => set({ modelingLoading: loading }),
      setModelingActivePanel: (panel) => set({ modelingActivePanel: panel }),
      setDatasetMode: (mode) => set({ datasetMode: mode }),
      setDatasetClassification: (c) => set({ datasetClassification: c }),
      setDatasetPassport: (p) => set({ datasetPassport: p }),
      setDetectedDomain: (domain) => set({ detectedDomain: domain }),
      setPrimaryEntityType: (entity) => set({ primaryEntityType: entity }),

      setAnalysisMode: (mode) => set({ analysisMode: mode }),
      setSimpleFunnelData: (data) => set({ simpleFunnelData: data }),
      setGenericMode: (enabled, reason) => set({ 
        genericMode: enabled, 
        genericModeReason: reason || 'No scientific column mapping was detected or confirmed.' 
      }),
      setRecoverableMode: (enabled) => set({ recoverableMode: enabled }),
      setGenericBannerDismissed: (dismissed) => set({ genericBannerDismissed: dismissed }),
      setVarianceFilterEnabled: (enabled) => set({ varianceFilterEnabled: enabled }),
      setVarianceSummary: (summary) => set({ varianceSummary: summary }),

      resetWorkspace: () =>
        set({
          workspaceId: '', filename: '', parquetPath: '', rowCount: 0,
          columns: [], preview: [], mappings: {}, mappingIntelligence: {},
          segStats: {}, segregationExecuted: false, activeSegregationResult: null,
          activeLineage: null, activeNodeId: '', activeNodeDetail: null, filterNodes: [],
          enrichmentMode: 'fast', includeMordred: false, selectedDescriptors: [],
          activeJobId: '', activeJobType: null, readiness: null, readinessLoading: false,
          modelingAnalysis: null, modelingLoading: false, modelingActivePanel: 'overview',
          datasetMode: 'MOLECULAR', datasetClassification: null, datasetPassport: null,
          detectedDomain: 'General Scientific', primaryEntityType: 'Compound',
          activeTab: 'ingest',
          analysisMode: 'simple', simpleFunnelData: null,
          genericMode: false, recoverableMode: false, genericBannerDismissed: false,
          varianceFilterEnabled: true, varianceSummary: null,
        }),
    }),
    { 
      name: 'sdo-workspace-storage-v3',
      version: 3,
      migrate: (persistedState: any, version: number) => {
        return {
          ...persistedState,
          activeJobId: '',
          activeJobType: null,
          analysisMode: 'simple',
          simpleFunnelData: null,
          genericMode: false,
          recoverableMode: false,
          genericBannerDismissed: false,
          varianceFilterEnabled: true,
          varianceSummary: null,
        };
      },
    }
  )
);
