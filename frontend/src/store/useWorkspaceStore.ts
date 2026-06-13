import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CompoundPreviewRow, VariableMappings, ReadinessResponse, ModelingAnalysis, DatasetMode, DatasetClassification, DatasetPassport } from '../types';

interface WorkspaceState {
  // Navigation
  inWorkspace: boolean;
  activeTab: string;
  currentStudioId: string | null;

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
  analysisMode: 'simple' | 'advanced' | 'compare';
  simpleFunnelData: any | null;

  // Zero-Mapping & Recoverable Modes
  genericMode: boolean;
  genericModeReason: string;
  recoverableMode: boolean;
  genericBannerDismissed: boolean;

  // Variance Filtering
  varianceFilterEnabled: boolean;
  varianceSummary: any | null;

  // ── Harmonization Control (Data Reduction Audit) ───────────────
  harmonizationSettings: {
    variance_conflict_strategy: string;
    duplicate_segregation_strategy: string;
    settings_confirmed: boolean;
    applied_at: string | null;
  };
  harmonizationAudit: any | null;
  rawIngestionCount: number;

  // ── V5: Subgroup Gate (Step 5) ─────────────────────────────────
  subgroupSelected: boolean;
  activeSubgroupName: string;
  activeSubgroupRows: number;
  activeSubgroupCompounds: number;

  // ── V5: Structure State (Step 6) ──────────────────────────────
  structureState: 'UNKNOWN' | 'MOLECULAR' | 'HYBRID' | 'NAME_ONLY';
  smilesCoveragePct: number;
  structuresAvailable: number;
  structuresMissing: number;
  structureRecommendation: 'proceed' | 'optional_recovery' | 'recommended_recovery' | 'recovery_required' | '';

  // ── V5: Recovery State (Step 7) ───────────────────────────────
  recoveryAttempted: boolean;
  recoveryCompleted: boolean;
  postRecoveryCoveragePct: number;

  // ── V5: Descriptor State (Step 8) ─────────────────────────────
  descriptorDatasetReady: boolean;
  descriptorCount: number;
  descriptorSizeTier: 'SMALL' | 'MEDIUM' | 'LARGE' | '';

  // ── V5 Navigation / Workspace Preference ──────────────────────
  sidebarPinned: boolean;
  setSidebarPinned: (pinned: boolean) => void;
  recentCommands: string[];
  addRecentCommand: (cmd: string) => void;

  // Setters
  setCurrentStudioId: (id: string | null) => void;
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

  setAnalysisMode: (mode: 'simple' | 'advanced' | 'compare') => void;
  setSimpleFunnelData: (data: any | null) => void;
  setGenericMode: (enabled: boolean, reason?: string) => void;
  setRecoverableMode: (enabled: boolean) => void;
  setGenericBannerDismissed: (dismissed: boolean) => void;
  setVarianceFilterEnabled: (enabled: boolean) => void;
  setVarianceSummary: (summary: any | null) => void;
  setHarmonizationSettings: (settings: any) => void;
  setHarmonizationAudit: (audit: any | null) => void;
  setRawIngestionCount: (count: number) => void;

  // ── V5 Actions ────────────────────────────────────────────────
  setActiveSubgroup: (name: string, rows: number, compounds: number) => void;
  setStructureState: (
    state: 'UNKNOWN' | 'MOLECULAR' | 'HYBRID' | 'NAME_ONLY',
    coveragePct: number,
    available: number,
    missing: number,
    recommendation: string
  ) => void;
  setRecoveryCompleted: (newCoveragePct: number) => void;
  setDescriptorReady: (count: number, tier: string) => void;
  clearActiveSubgroup: () => void;

  resetWorkspace: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      inWorkspace: false,
      activeTab: 'ingest',
      currentStudioId: null,

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

      harmonizationSettings: {
        variance_conflict_strategy: 'KEEP_ALL',
        duplicate_segregation_strategy: 'KEEP_ALL',
        settings_confirmed: false,
        applied_at: null,
      },
      harmonizationAudit: null,
      rawIngestionCount: 0,

      subgroupSelected: false,
      activeSubgroupName: '',
      activeSubgroupRows: 0,
      activeSubgroupCompounds: 0,
      structureState: 'UNKNOWN',
      smilesCoveragePct: 0,
      structuresAvailable: 0,
      structuresMissing: 0,
      structureRecommendation: '',
      recoveryAttempted: false,
      recoveryCompleted: false,
      postRecoveryCoveragePct: 0,
      descriptorDatasetReady: false,
      descriptorCount: 0,
      descriptorSizeTier: '',

      sidebarPinned: true,
      recentCommands: [],

      setCurrentStudioId: (id) => set({ currentStudioId: id }),
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
      setHarmonizationSettings: (settings) => set({ harmonizationSettings: settings }),
      setHarmonizationAudit: (audit) => set({ harmonizationAudit: audit }),
      setRawIngestionCount: (count) => set({ rawIngestionCount: count }),

      setActiveSubgroup: (name, rows, compounds) => set({
        subgroupSelected: true,
        activeSubgroupName: name,
        activeSubgroupRows: rows,
        activeSubgroupCompounds: compounds,
        structureState: 'UNKNOWN',
        smilesCoveragePct: 0,
        structuresAvailable: 0,
        structuresMissing: 0,
        structureRecommendation: '',
        recoveryAttempted: false,
        recoveryCompleted: false,
        postRecoveryCoveragePct: 0,
        descriptorDatasetReady: false,
        descriptorCount: 0,
        descriptorSizeTier: '',
      }),
      setStructureState: (state, coveragePct, available, missing, recommendation) => set({
        structureState: state,
        smilesCoveragePct: coveragePct,
        structuresAvailable: available,
        structuresMissing: missing,
        structureRecommendation: recommendation as any,
      }),
      setRecoveryCompleted: (newCoveragePct) => set({
        recoveryAttempted: true,
        recoveryCompleted: true,
        postRecoveryCoveragePct: newCoveragePct,
      }),
      setDescriptorReady: (count, tier) => set({
        descriptorDatasetReady: true,
        descriptorCount: count,
        descriptorSizeTier: tier as any,
      }),
      clearActiveSubgroup: () => set({
        subgroupSelected: false,
        activeSubgroupName: '',
        activeSubgroupRows: 0,
        activeSubgroupCompounds: 0,
        structureState: 'UNKNOWN',
        smilesCoveragePct: 0,
        structuresAvailable: 0,
        structuresMissing: 0,
        structureRecommendation: '',
        recoveryAttempted: false,
        recoveryCompleted: false,
        postRecoveryCoveragePct: 0,
        descriptorDatasetReady: false,
        descriptorCount: 0,
        descriptorSizeTier: '',
      }),

      setSidebarPinned: (pinned) => set({ sidebarPinned: pinned }),
      addRecentCommand: (cmd) => set((state) => {
        const filtered = state.recentCommands.filter(c => c !== cmd);
        return { recentCommands: [cmd, ...filtered].slice(0, 5) };
      }),

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
          harmonizationSettings: {
            variance_conflict_strategy: 'KEEP_ALL',
            duplicate_segregation_strategy: 'KEEP_ALL',
            settings_confirmed: false,
            applied_at: null,
          },
          harmonizationAudit: null,
          rawIngestionCount: 0,
          subgroupSelected: false, activeSubgroupName: '', activeSubgroupRows: 0, activeSubgroupCompounds: 0,
          structureState: 'UNKNOWN', smilesCoveragePct: 0, structuresAvailable: 0, structuresMissing: 0,
          structureRecommendation: '', recoveryAttempted: false, recoveryCompleted: false,
          postRecoveryCoveragePct: 0, descriptorDatasetReady: false, descriptorCount: 0, descriptorSizeTier: '',
        }),
    }),
    { 
      name: 'sdo-workspace-storage-v5',
      version: 5,
      migrate: (_persistedState: any, _version: number) => {
        // Hard wipe on any version upgrade — forces fresh defaults
        if (_version < 5) {
          return {
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
          subgroupSelected: false,
          activeSubgroupName: '',
          activeSubgroupRows: 0,
          activeSubgroupCompounds: 0,
          structureState: 'UNKNOWN',
          smilesCoveragePct: 0,
          structuresAvailable: 0,
          structuresMissing: 0,
          structureRecommendation: '',
          recoveryAttempted: false,
          recoveryCompleted: false,
          postRecoveryCoveragePct: 0,
          descriptorDatasetReady: false,
          descriptorCount: 0,
            descriptorSizeTier: '',
          };
        }
        return _persistedState;
      },
    }
  )
);
