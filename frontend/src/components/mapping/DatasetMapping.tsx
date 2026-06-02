import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Database, Link2, Check, ChevronDown, ChevronRight, 
  Scale, ShieldAlert, Award, Compass, Timer, Beaker,
  Dna, Fingerprint, Layers, Activity, Zap, FileText,
  FlaskConical, Map, Microscope, BarChart3, BookOpen
} from 'lucide-react';
import * as Select from '@radix-ui/react-select';
import * as Accordion from '@radix-ui/react-accordion';
import type { VariableMappings } from '../../types';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

interface DatasetMappingProps {
  columns: string[];
  mappings: VariableMappings;
  setMappings: (mappings: VariableMappings) => void;
  handleSaveMappings: () => Promise<void>;
}

// ─── V3 UNIVERSAL SCIENTIFIC ONTOLOGY — all 50+ roles ────────────────────────
const mapOptions = [
  { value: 'none', label: 'Ignore Column', group: 'none' },

  // ── Chemical Identity ──────────────────────────────────────────────────────
  { value: 'chemical_name',    label: 'Chemical Name',            group: 'chemical_identity' },
  { value: 'compound_name',    label: 'Compound Name',            group: 'chemical_identity' },
  { value: 'substance_name',   label: 'Substance Name',           group: 'chemical_identity' },
  { value: 'drug_name',        label: 'Drug Name',                group: 'chemical_identity' },
  { value: 'molecule_name',    label: 'Molecule Name',            group: 'chemical_identity' },
  { value: 'analyte',          label: 'Analyte',                  group: 'chemical_identity' },
  { value: 'ingredient',       label: 'Ingredient',               group: 'chemical_identity' },
  { value: 'active_ingredient',label: 'Active Ingredient',        group: 'chemical_identity' },
  { value: 'test_substance',   label: 'Test Substance',           group: 'chemical_identity' },
  { value: 'test_material',    label: 'Test Material',            group: 'chemical_identity' },
  { value: 'study_material',   label: 'Study Material',           group: 'chemical_identity' },

  // ── Structure ──────────────────────────────────────────────────────────────
  { value: 'smiles',    label: 'SMILES / Canonical SMILES',       group: 'structure' },
  { value: 'inchi',     label: 'InChI',                           group: 'structure' },
  { value: 'inchikey',  label: 'InChIKey',                        group: 'structure' },
  { value: 'molfile',   label: 'Molfile / SDF Block',             group: 'structure' },

  // ── Chemical Identifiers ───────────────────────────────────────────────────
  { value: 'cas_number',    label: 'CAS Registry Number',         group: 'identifiers' },
  { value: 'chemical_id',   label: 'Compound ID (Internal)',      group: 'identifiers' },
  { value: 'cid',           label: 'PubChem CID',                 group: 'identifiers' },
  { value: 'chembl_id',     label: 'ChEMBL ID',                   group: 'identifiers' },
  { value: 'dsstox_id',     label: 'DSSTox DTXSID',               group: 'identifiers' },
  { value: 'ec_number',     label: 'EC / EINECS Number',          group: 'identifiers' },
  { value: 'unii',          label: 'FDA UNII',                    group: 'identifiers' },
  { value: 'drugbank_id',   label: 'DrugBank ID',                 group: 'identifiers' },
  { value: 'chebi_id',      label: 'ChEBI ID',                    group: 'identifiers' },

  // ── Species & Taxonomy ─────────────────────────────────────────────────────
  { value: 'organism',          label: 'Test Organism / Species', group: 'taxonomy' },
  { value: 'species',           label: 'Species (Scientific Name)', group: 'taxonomy' },
  { value: 'taxon',             label: 'Taxon / Taxonomic Name',  group: 'taxonomy' },
  { value: 'common_name',       label: 'Common Name (Organism)',  group: 'taxonomy' },
  { value: 'strain',            label: 'Strain / Breed / Variant', group: 'taxonomy' },
  { value: 'life_stage',        label: 'Life Stage (Adult / Larva)', group: 'taxonomy' },
  { value: 'trophic_level',     label: 'Trophic Level',           group: 'taxonomy' },
  { value: 'taxonomic_kingdom', label: 'Kingdom (Animalia etc.)', group: 'taxonomy' },

  // ── Exposure ───────────────────────────────────────────────────────────────
  { value: 'exposure_time',          label: 'Exposure Duration',              group: 'exposure' },
  { value: 'treatment_duration',     label: 'Treatment Duration',             group: 'exposure' },
  { value: 'contact_time',           label: 'Contact Time',                   group: 'exposure' },
  { value: 'observation_period',     label: 'Observation Period',             group: 'exposure' },
  { value: 'duration_days',          label: 'Duration (Days)',                group: 'exposure' },
  { value: 'exposure_concentration', label: 'Exposure Concentration',         group: 'exposure' },
  { value: 'exposure_route',         label: 'Exposure Route (Oral, Inhalation)', group: 'exposure' },
  { value: 'test_medium',            label: 'Test Medium (Soil / Water)',     group: 'exposure' },
  { value: 'temperature',            label: 'Temperature',                    group: 'exposure' },
  { value: 'ph',                     label: 'pH',                             group: 'exposure' },
  { value: 'dissolved_oxygen',       label: 'Dissolved Oxygen',               group: 'exposure' },
  { value: 'salinity',               label: 'Salinity',                       group: 'exposure' },
  { value: 'hardness',               label: 'Water Hardness',                 group: 'exposure' },

  // ── Concentration / Dose ──────────────────────────────────────────────────
  { value: 'value',       label: 'Endpoint Value / Potency',      group: 'endpoints' },
  { value: 'dose',        label: 'Dose / Administered Dose',      group: 'endpoints' },
  { value: 'concentration', label: 'Concentration',               group: 'endpoints' },
  { value: 'pXC50',       label: 'pXC50 (Log Potency)',           group: 'endpoints' },

  // ── Endpoints ──────────────────────────────────────────────────────────────
  { value: 'endpoint',          label: 'Biological / Assay Endpoint',       group: 'endpoints' },
  { value: 'toxicity',          label: 'Toxicity Value / Score',            group: 'endpoints' },
  { value: 'toxicity_endpoint', label: 'Toxicity Endpoint (LC50, EC50…)',   group: 'endpoints' },
  { value: 'assay_type',        label: 'Assay Type',                        group: 'endpoints' },
  { value: 'target_gene',       label: 'Target Gene / Protein',             group: 'endpoints' },
  { value: 'cell_line',         label: 'Cell Line',                         group: 'endpoints' },
  { value: 'effect_type',       label: 'Effect Type (Mortality, Growth)',   group: 'endpoints' },
  { value: 'observation_type',  label: 'Observation Type',                  group: 'endpoints' },
  { value: 'behavior',          label: 'Behavioral Endpoint / Response',    group: 'endpoints' },

  // ── Units ──────────────────────────────────────────────────────────────────
  { value: 'unit',               label: 'Measurement Unit',        group: 'units' },
  { value: 'time_unit',          label: 'Time Unit',               group: 'units' },
  { value: 'concentration_unit', label: 'Concentration Unit',      group: 'units' },
  { value: 'qualifier',          label: 'Qualifier (>, <, =)',     group: 'units' },
  { value: 'dose_unit',          label: 'Dose Unit',               group: 'units' },

  // ── Study Design ───────────────────────────────────────────────────────────
  { value: 'study_type',      label: 'Study Type (Acute, Chronic)', group: 'metadata' },
  { value: 'test_type',       label: 'Test Type / Study Design',  group: 'metadata' },
  { value: 'glp_compliant',   label: 'GLP Compliant',             group: 'metadata' },
  { value: 'study_year',      label: 'Study Year',                group: 'metadata' },
  { value: 'source_database', label: 'Source Database',           group: 'metadata' },
  { value: 'reference',       label: 'Literature Reference',      group: 'metadata' },
  { value: 'author',          label: 'Author / Researcher',       group: 'metadata' },
  { value: 'journal',         label: 'Journal / Publication',     group: 'metadata' },

  // ── Biological Effect ──────────────────────────────────────────────────────
  { value: 'bioactivity',    label: 'Bioactivity Class (Active/Inactive)', group: 'endpoints' },
  { value: 'mechanism',      label: 'Mechanism of Action',        group: 'endpoints' },
  { value: 'pathway',        label: 'Biological Pathway',         group: 'endpoints' },
  { value: 'gene_expression',label: 'Gene Expression Level',      group: 'omics' },
  { value: 'protein_level',  label: 'Protein Level',              group: 'omics' },
  { value: 'metabolite',     label: 'Metabolite',                 group: 'omics' },

  // ── Clinical / Patient ─────────────────────────────────────────────────────
  { value: 'patient_id',      label: 'Patient ID',                group: 'clinical' },
  { value: 'age',             label: 'Age',                       group: 'clinical' },
  { value: 'sex',             label: 'Sex / Gender',              group: 'clinical' },
  { value: 'clinical_phase',  label: 'Clinical Phase',            group: 'clinical' },
  { value: 'adverse_event',   label: 'Adverse Event',             group: 'clinical' },
  { value: 'disease',         label: 'Disease / Indication',      group: 'clinical' },
  { value: 'dosage_regimen',  label: 'Dosage Regimen',            group: 'clinical' },

  // ── Pharmacokinetics / ADME ────────────────────────────────────────────────
  { value: 'clearance',       label: 'Clearance (Cl)',            group: 'adme' },
  { value: 'bioavailability', label: 'Bioavailability (F%)',      group: 'adme' },
  { value: 'cmax',            label: 'Max Concentration (Cmax)',  group: 'adme' },
  { value: 'tmax',            label: 'Time of Max Concentration (Tmax)', group: 'adme' },
  { value: 'vd',              label: 'Volume of Distribution (Vd)', group: 'adme' },
  { value: 'auc',             label: 'AUC (Area Under Curve)',    group: 'adme' },
  { value: 'protein_binding', label: 'Plasma Protein Binding %', group: 'adme' },

  // ── Physicochemical Properties ─────────────────────────────────────────────
  { value: 'molecular_weight',    label: 'Molecular Weight',     group: 'physchem' },
  { value: 'logp',                label: 'LogP / Partition Coefficient', group: 'physchem' },
  { value: 'pka',                 label: 'pKa / Dissociation Constant', group: 'physchem' },
  { value: 'tpsa',                label: 'Topological Polar Surface Area (TPSA)', group: 'physchem' },
  { value: 'h_bond_donors',       label: 'H-Bond Donors',        group: 'physchem' },
  { value: 'h_bond_acceptors',    label: 'H-Bond Acceptors',     group: 'physchem' },
  { value: 'rotatable_bonds',     label: 'Rotatable Bonds',      group: 'physchem' },
  { value: 'solubility',          label: 'Solubility',           group: 'physchem' },
  { value: 'boiling_point',       label: 'Boiling Point',        group: 'physchem' },
  { value: 'melting_point',       label: 'Melting Point',        group: 'physchem' },
  { value: 'vapor_pressure',      label: 'Vapor Pressure',       group: 'physchem' },

  // ── Environmental Fate ─────────────────────────────────────────────────────
  { value: 'biodegradation',  label: 'Biodegradation (%)',        group: 'envfate' },
  { value: 'half_life',       label: 'Half-Life (DT50)',          group: 'envfate' },
  { value: 'bcf',             label: 'Bioconcentration Factor (BCF)', group: 'envfate' },
  { value: 'koc',             label: 'Organic Carbon Partition Coefficient (Koc)', group: 'envfate' },
  { value: 'henry_constant',  label: "Henry's Law Constant",      group: 'envfate' },
  { value: 'photolysis',      label: 'Photolysis Rate',           group: 'envfate' },

  // ── Geographic / Environmental ─────────────────────────────────────────────
  { value: 'location',        label: 'Sampling Location',         group: 'geographic' },
  { value: 'country',         label: 'Country',                   group: 'geographic' },
  { value: 'ecoregion',       label: 'Ecoregion / Habitat',       group: 'geographic' },
  { value: 'latitude',        label: 'Latitude',                  group: 'geographic' },
  { value: 'longitude',       label: 'Longitude',                 group: 'geographic' },

  // ── Regulatory ─────────────────────────────────────────────────────────────
  { value: 'regulatory_status',   label: 'Regulatory Status',    group: 'metadata' },
  { value: 'regulatory_limit',    label: 'Regulatory Limit / TDI', group: 'metadata' },
  { value: 'oecd_guideline',      label: 'OECD Guideline Number', group: 'metadata' },
  { value: 'reach_registration',  label: 'REACH Registration',   group: 'metadata' },
  { value: 'ghs_classification',  label: 'GHS Classification',   group: 'metadata' },

  // ── Generic Fallback ───────────────────────────────────────────────────────
  { value: 'generic_variable', label: '⚙ Generic / Unmapped Variable', group: 'generic' },
];

// Group labels for Select dropdown separators
const GROUP_LABELS: Record<string, string> = {
  none: '',
  chemical_identity: '── Chemical Identity ──',
  structure: '── Molecular Structure ──',
  identifiers: '── Chemical Identifiers ──',
  taxonomy: '── Species & Taxonomy ──',
  exposure: '── Exposure Conditions ──',
  endpoints: '── Bioassay Endpoints ──',
  units: '── Units & Qualifiers ──',
  omics: '── Omics ──',
  clinical: '── Clinical / Patient ──',
  adme: '── Pharmacokinetics / ADME ──',
  physchem: '── Physicochemical Properties ──',
  envfate: '── Environmental Fate ──',
  geographic: '── Geographic ──',
  metadata: '── Study Design & Metadata ──',
  generic: '── Generic ──',
};

export const DatasetMapping: React.FC<DatasetMappingProps> = ({
  columns, mappings, setMappings, handleSaveMappings
}) => {
  const intelligence = useWorkspaceStore(state => state.mappingIntelligence) || {};

  const handleSelect = (col: string, val: string) => {
    setMappings({ ...mappings, [col]: val as any });
  };

  const datasetClassification = useMemo(() => {
    const values = Object.values(mappings);
    const colsLower = columns.map(c => c.toLowerCase());
    
    if (colsLower.some(c => c.includes('biodeg') || c.includes('bcf'))) return "Environmental Fate Dataset";
    if (colsLower.some(c => c.includes('oecd') || c.includes('reach'))) return "OECD Regulatory Dataset";
    if (colsLower.some(c => c.includes('fish') || c.includes('daphnia'))) return "Aquatic Toxicity Dataset";
    if (colsLower.some(c => c.includes('rat') || c.includes('human'))) return "Bioassay / Clinical Dataset";
    if (values.includes('smiles' as any) && values.includes('value' as any)) return "ADMET Dataset";
    if (colsLower.some(c => c.includes('gene') || c.includes('transcript'))) return "Omics Dataset";
    
    return "Bioassay Dataset";
  }, [mappings, columns]);

  const safetyWarnings = useMemo(() => {
    const warnings: string[] = [];
    let hasHuman = false, hasFish = false, hasLC50 = false, hasOral = false, hasNOEC = false, hasDuration = false;

    Object.entries(mappings).forEach(([col, role]) => {
      if (role === 'none' || !role) return;
      const colLower = col.toLowerCase();
      if (colLower.includes('human') || colLower.includes('clinical')) hasHuman = true;
      if (colLower.includes('fish') || colLower.includes('zebrafish')) hasFish = true;
      if (colLower.includes('lc50')) hasLC50 = true;
      if (colLower.includes('noec')) hasNOEC = true;
      if (role === 'exposure_time' || colLower.includes('96h')) hasDuration = true;
      if (colLower.includes('oral') || colLower.includes('diet')) hasOral = true;
    });

    if (hasHuman && hasLC50) warnings.push("Detected LC50 endpoint alongside Human species mappings. LC50 is standardly reserved for ecotoxicology.");
    if (hasFish && hasOral) warnings.push("Fish test species mapped with Oral route (aquatic organisms usually exposed via water).");
    if (hasNOEC && !hasDuration) warnings.push("Detected NOEC chronic threshold without an explicit study Exposure Duration.");

    return warnings;
  }, [mappings]);

  // Semantic Grouping — expanded for V3 ontology
  const columnGroups = useMemo(() => {
    const groups = { 
      unmapped: [] as string[], 
      identifiers: [] as string[], 
      structure: [] as string[],
      physchem: [] as string[],
      endpoints: [] as string[], 
      taxonomy: [] as string[], 
      exposure: [] as string[], 
      envfate: [] as string[],
      clinical: [] as string[],
      adme: [] as string[],
      omics: [] as string[],
      geographic: [] as string[],
      metadata: [] as string[],
      generic: [] as string[],
      ignored: [] as string[] 
    };

    const CHEMICAL_IDENTITY_VALS = ['chemical_name','compound_name','substance_name','drug_name',
      'molecule_name','analyte','ingredient','active_ingredient','test_substance','test_material','study_material'];
    const STRUCTURE_VALS = ['smiles','inchi','inchikey','molfile'];
    const IDENTIFIER_VALS = ['cas_number','chemical_id','cid','chembl_id','dsstox_id','ec_number','unii','drugbank_id','chebi_id'];
    const PHYSCHEM_VALS = ['molecular_weight','logp','pka','tpsa','h_bond_donors','h_bond_acceptors','rotatable_bonds','solubility','boiling_point','melting_point','vapor_pressure'];
    const ENDPOINT_VALS = ['endpoint','toxicity','toxicity_endpoint','behavior','value','dose','concentration','unit','qualifier','dose_unit','concentration_unit','pXC50','assay_type','target_gene','cell_line','effect_type','observation_type','bioactivity','mechanism','pathway'];
    const TAXONOMY_VALS = ['organism','species','taxon','common_name','strain','life_stage','trophic_level','taxonomic_kingdom'];
    const EXPOSURE_VALS = ['exposure_time','duration_days','exposure_concentration','exposure_route','test_medium','temperature','ph','dissolved_oxygen','salinity','hardness'];
    const ENVFATE_VALS = ['biodegradation','half_life','bcf','koc','henry_constant','photolysis'];
    const CLINICAL_VALS = ['patient_id','age','sex','clinical_phase','adverse_event','disease','dosage_regimen'];
    const ADME_VALS = ['clearance','bioavailability','cmax','tmax','vd','auc','protein_binding'];
    const OMICS_VALS = ['gene_expression','protein_level','metabolite'];
    const GEOGRAPHIC_VALS = ['location','country','ecoregion','latitude','longitude'];
    const METADATA_VALS = ['study_type','test_type','glp_compliant','study_year','source_database','reference','author','journal','regulatory_status','regulatory_limit','oecd_guideline','reach_registration','ghs_classification'];
    const GENERIC_VALS = ['generic_variable'];

    columns.forEach(col => {
      const val = mappings[col];
      if (!val) { groups.unmapped.push(col); return; }
      if (val === 'none') { groups.ignored.push(col); return; }
      if (CHEMICAL_IDENTITY_VALS.includes(val)) { groups.identifiers.push(col); return; }
      if (STRUCTURE_VALS.includes(val)) { groups.structure.push(col); return; }
      if (IDENTIFIER_VALS.includes(val)) { groups.identifiers.push(col); return; }
      if (PHYSCHEM_VALS.includes(val)) { groups.physchem.push(col); return; }
      if (ENDPOINT_VALS.includes(val)) { groups.endpoints.push(col); return; }
      if (TAXONOMY_VALS.includes(val)) { groups.taxonomy.push(col); return; }
      if (EXPOSURE_VALS.includes(val)) { groups.exposure.push(col); return; }
      if (ENVFATE_VALS.includes(val)) { groups.envfate.push(col); return; }
      if (CLINICAL_VALS.includes(val)) { groups.clinical.push(col); return; }
      if (ADME_VALS.includes(val)) { groups.adme.push(col); return; }
      if (OMICS_VALS.includes(val)) { groups.omics.push(col); return; }
      if (GEOGRAPHIC_VALS.includes(val)) { groups.geographic.push(col); return; }
      if (METADATA_VALS.includes(val)) { groups.metadata.push(col); return; }
      if (GENERIC_VALS.includes(val)) { groups.generic.push(col); return; }
      groups.unmapped.push(col);
    });
    return groups;
  }, [columns, mappings]);

  const renderColumnItem = (col: string) => {
    const mappedValue = (mappings[col] || 'none') as any;
    const isMapped = mappedValue !== 'none' && mappedValue !== undefined;
    const intel = (intelligence[col] || {}) as any;
    
    // Determine confidence tier for badges
    const confidence = intel.confidence ?? 0;
    const needsConfirm = intel.needs_user_confirmation ?? false;
    const layer = intel.layer_reached ?? 5;
    
    let badgeType: 'AUTO' | 'REVIEW' | 'CONFIRM' = 'CONFIRM';
    if (isMapped && mappedValue !== 'none') {
      if (layer <= 2 && confidence >= 0.90 && !needsConfirm) {
        badgeType = 'AUTO';
      } else if (layer <= 4 && confidence >= 0.55) {
        badgeType = 'REVIEW';
      }
    }

    const layerNames: Record<number, string> = {
      1: 'Exact Match',
      2: 'Synonym Match',
      3: 'Fuzzy Similarity',
      4: 'AI Semantic Overlap',
      5: 'Manual Placement'
    };

    // Build grouped select items — each group wrapped in Select.Group (Radix UI requirement)
    const groupedItems = (() => {
      // Pre-group options to avoid duplicate Select.Group per group name
      const groups: { groupKey: string; label: string; items: typeof mapOptions }[] = [];
      let currentGroup = '';
      let currentItems: typeof mapOptions = [];

      mapOptions.forEach(opt => {
        if (opt.group !== currentGroup) {
          if (currentItems.length > 0) {
            groups.push({ groupKey: currentGroup, label: GROUP_LABELS[currentGroup] || '', items: currentItems });
          }
          currentGroup = opt.group;
          currentItems = [opt];
        } else {
          currentItems.push(opt);
        }
      });
      if (currentItems.length > 0) {
        groups.push({ groupKey: currentGroup, label: GROUP_LABELS[currentGroup] || '', items: currentItems });
      }

      return groups.map((g, gi) => (
        <Select.Group key={`grp-${g.groupKey}-${gi}`}>
          {g.label && (
            <Select.Label className="px-4 py-1.5 text-[9px] font-extrabold uppercase tracking-widest text-white/20 mt-1">
              {g.label}
            </Select.Label>
          )}
          {g.items.map(opt => (
            <Select.Item
              key={opt.value}
              value={opt.value}
              className={`flex items-center px-4 py-2 text-xs font-semibold rounded-xl cursor-pointer outline-none select-none transition-colors
                ${opt.value === 'none' ? 'text-white/30 focus:bg-white/[0.04]' :
                  opt.value === 'generic_variable' ? 'text-violet-300 focus:bg-violet-500/10' :
                  'text-white/60 focus:bg-cyan-500/10 focus:text-cyan-400'}`}
            >
              <Select.ItemText>{opt.label}</Select.ItemText>
              <Select.ItemIndicator className="ml-auto"><Check className="w-3.5 h-3.5 text-cyan-400" /></Select.ItemIndicator>
            </Select.Item>
          ))}
        </Select.Group>
      ));
    })();

    return (
      <div key={col} className={`flex flex-col gap-4 p-5 rounded-2xl border transition-all duration-300 ${isMapped ? 'bg-white/[0.01] border-white/[0.08]' : 'bg-transparent border-white/[0.03] hover:border-white/[0.08]'}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Database className={`w-4.5 h-4.5 ${isMapped ? 'text-cyan-400' : 'text-muted'}`} />
            <div className="flex flex-col">
              <span className={`text-sm font-semibold tracking-tight ${isMapped ? 'text-white' : 'text-secondary'}`}>{col}</span>
              {isMapped && intel.confidence !== undefined && (
                <span className="text-[10px] text-muted flex items-center gap-1 mt-0.5" title={`Ontology scanning matched this column via Layer ${layer}: ${layerNames[layer]}`}>
                  <Layers className="w-3 h-3 text-cyan-500/80" />
                  Layer {layer}: {layerNames[layer] || 'Inference Engine'}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* V3 Confidence Badge */}
            {isMapped && (
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border uppercase tracking-wider
                ${badgeType === 'AUTO' 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.05)]' 
                  : badgeType === 'REVIEW'
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.05)]'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.05)]'
                }`}
              >
                {badgeType === 'AUTO' ? 'AUTO-MAPPED' : badgeType === 'REVIEW' ? 'REVIEW' : 'CONFIRM'}
              </span>
            )}

            <Select.Root value={mappedValue} onValueChange={(val) => handleSelect(col, val)}>
              <Select.Trigger className={`flex items-center justify-between w-72 px-3 py-2 rounded-xl text-xs font-semibold border transition-all outline-none focus:ring-2 focus:ring-cyan-500/30
                ${isMapped ? 'bg-cyan-500/10 border-cyan-500/25 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.05)]' : 'bg-white/[0.03] border-white/[0.06] text-secondary hover:bg-white/[0.06]'}
              `}>
                <Select.Value placeholder="Select Mapping..." />
                <Select.Icon><ChevronDown className="w-3.5 h-3.5 opacity-50" /></Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="overflow-hidden bg-[#0a0d18] border border-white/[0.08] rounded-2xl shadow-2xl z-50 animate-in fade-in max-h-80 overflow-y-auto">
                  <Select.Viewport className="p-1">
                    {groupedItems}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>
        </div>
        
        {isMapped && intel.confidence !== undefined && (
          <div className="border-t border-white/[0.04] pt-4 space-y-3.5">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted w-16 shrink-0">Confidence</span>
                <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${intel.confidence > 0.8 ? 'bg-emerald-500' : intel.confidence > 0.5 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${intel.confidence * 100}%` }} />
                </div>
                <span className="text-xs font-mono text-secondary w-8 text-right shrink-0">{Math.round(intel.confidence * 100)}%</span>
              </div>
            </div>

            {/* Display reasons for match */}
            {intel.reasons && intel.reasons.length > 0 && (
              <div className="text-[10px] text-muted leading-relaxed flex items-start gap-1.5 bg-white/[0.01] p-2.5 rounded-xl border border-white/[0.03]">
                <span className="text-cyan-400 shrink-0 font-semibold">•</span>
                <span className="italic">{intel.reasons[0]}</span>
              </div>
            )}

            {/* Alternatives section */}
            {intel.alternatives && intel.alternatives.length > 0 && (
              <div className="space-y-2">
                <span className="text-[9px] uppercase font-extrabold tracking-widest text-muted block">Alternative Suggestions</span>
                <div className="flex flex-wrap gap-2">
                  {intel.alternatives.map((alt: any) => {
                    const optionLabel = mapOptions.find(o => o.value === alt.mapped_to)?.label || alt.mapped_to;
                    return (
                      <button
                        type="button"
                        key={alt.mapped_to}
                        onClick={(e) => { e.preventDefault(); handleSelect(col, alt.mapped_to.toLowerCase()); }}
                        className="px-2.5 py-1.5 rounded-xl bg-white/[0.02] hover:bg-cyan-500/10 border border-white/[0.06] hover:border-cyan-500/25 text-[10px] font-semibold text-secondary hover:text-cyan-400 transition-all flex items-center gap-1.5"
                      >
                        <span>{optionLabel}</span>
                        <span className="px-1 py-0.5 rounded bg-white/[0.04] text-[8px] font-mono text-muted">{Math.round(alt.confidence * 100)}%</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const AccordionSection = ({ title, icon: Icon, columns }: any) => {
    if (columns.length === 0) return null;
    return (
      <Accordion.Item value={title} className="glass rounded-[2rem] mb-4 border border-white/[0.06] overflow-hidden">
        <Accordion.Header>
          <Accordion.Trigger className="flex items-center justify-between w-full p-6 bg-white/[0.01] hover:bg-white/[0.02] transition-colors outline-none group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-500/20">
                <Icon className="w-5 h-5" />
              </div>
              <div className="text-left">
                <h3 className="text-white font-medium">{title}</h3>
                <p className="text-xs text-muted">{columns.length} Columns</p>
              </div>
            </div>
            <ChevronDown className="w-5 h-5 text-muted transition-transform duration-300 group-data-[state=open]:rotate-180" />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content className="p-6 pt-0 border-t border-white/[0.06] space-y-4 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in">
          {columns.map(renderColumnItem)}
        </Accordion.Content>
      </Accordion.Item>
    );
  };

  // Compute stats for mapping summary bar
  const summaryCounts = useMemo(() => {
    let autoMapped = 0;
    let underReview = 0;
    let confirmationRequired = 0;
    
    columns.forEach(col => {
      const intel = (intelligence[col] || {}) as any;
      const mappedValue = (mappings[col] || 'none') as any;
      
      if (!mappedValue || mappedValue === 'none') {
        confirmationRequired++;
        return;
      }
      
      const confidence = intel.confidence ?? 0;
      const needsConfirm = intel.needs_user_confirmation ?? false;
      const layer = intel.layer_reached ?? 5;
      
      if (layer <= 2 && confidence >= 0.90 && !needsConfirm) {
        autoMapped++;
      } else if (layer <= 4 && confidence >= 0.55) {
        underReview++;
      } else {
        confirmationRequired++;
      }
    });
    
    return {
      total: columns.length,
      autoMapped,
      underReview,
      confirmationRequired
    };
  }, [columns, intelligence, mappings]);

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-1">Variable Mapping</h1>
        <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest block mb-3">Schema Bindings</p>
        <p className="text-secondary text-sm max-w-md mx-auto">
          Bind your dataset columns to the Universal Scientific Ontology (50+ scientific roles). SDO's multi-signal mapping intelligence handles complex ecotox, clinical, and omics schemas automatically.
        </p>
      </div>

      {/* Schema Intelligence Overview Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="glass p-4.5 rounded-2xl border border-white/[0.05] bg-white/[0.01]">
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider block mb-1">Total Columns</span>
          <h4 className="text-xl font-bold text-white leading-none mt-1">{summaryCounts.total}</h4>
        </div>
        <div className="glass p-4.5 rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.01]">
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">Auto-Mapped</span>
          <h4 className="text-xl font-bold text-emerald-400 leading-none mt-1">{summaryCounts.autoMapped}</h4>
        </div>
        <div className="glass p-4.5 rounded-2xl border border-amber-500/10 bg-amber-500/[0.01]">
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1">Under Review</span>
          <h4 className="text-xl font-bold text-amber-400 leading-none mt-1">{summaryCounts.underReview}</h4>
        </div>
        <div className="glass p-4.5 rounded-2xl border border-rose-500/10 bg-rose-500/[0.01]">
          <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block mb-1">Needs Confirm</span>
          <h4 className="text-xl font-bold text-rose-400 leading-none mt-1">{summaryCounts.confirmationRequired}</h4>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="glass p-5 rounded-2xl border-cyan-500/10 bg-cyan-500/[0.01] flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block mb-1">Inferred Dataset Type</span>
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5 mt-1"><Award className="w-4 h-4 text-cyan-400 shrink-0" />{datasetClassification}</h4>
          </div>
        </div>
        <div className="glass p-5 rounded-2xl border-violet-500/10 bg-violet-500/[0.01] col-span-2">
          <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider block mb-1">Regulatory Standards Compatibility</span>
          <div className="flex flex-wrap gap-2 mt-2.5">
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[10px] font-medium text-white flex items-center gap-1"><Scale className="w-3 h-3 text-cyan-400" /> OECD Series</span>
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[10px] font-medium text-white flex items-center gap-1"><Scale className="w-3 h-3 text-violet-400" /> REACH / ECHA</span>
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[10px] font-medium text-white flex items-center gap-1"><BookOpen className="w-3 h-3 text-emerald-400" /> ChEMBL / PubChem</span>
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[10px] font-medium text-white flex items-center gap-1"><Microscope className="w-3 h-3 text-amber-400" /> ECOTOX</span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {safetyWarnings.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="glass p-5 rounded-2xl border-rose-500/20 bg-rose-500/[0.02] mb-6 shadow-[0_0_15px_rgba(244,63,94,0.1)]">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="w-4.5 h-4.5 text-rose-400 shrink-0 animate-pulse" />
              <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider">Toxicological Safety Alerts</h4>
            </div>
            <ul className="space-y-2 text-xs text-secondary leading-normal">
              {safetyWarnings.map((warning, index) => <li key={index} className="flex items-start gap-2"><span className="text-rose-500/80 mt-0.5">•</span><span>{warning}</span></li>)}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <Accordion.Root type="multiple" defaultValue={['Unmapped Columns', 'Chemical Identifiers & Identity', 'Bioassay Endpoints']}>
        <AccordionSection title="Unmapped Columns" icon={Layers} columns={columnGroups.unmapped} />
        <AccordionSection title="Chemical Identifiers & Identity" icon={Fingerprint} columns={columnGroups.identifiers} />
        <AccordionSection title="Molecular Structure" icon={FlaskConical} columns={columnGroups.structure} />
        <AccordionSection title="Physicochemical Properties" icon={Beaker} columns={columnGroups.physchem} />
        <AccordionSection title="Bioassay Endpoints" icon={Activity} columns={columnGroups.endpoints} />
        <AccordionSection title="Species & Taxonomy" icon={Dna} columns={columnGroups.taxonomy} />
        <AccordionSection title="Exposure Conditions" icon={Timer} columns={columnGroups.exposure} />
        <AccordionSection title="Environmental Fate" icon={Compass} columns={columnGroups.envfate} />
        <AccordionSection title="Pharmacokinetics & ADME" icon={Zap} columns={columnGroups.adme} />
        <AccordionSection title="Omics" icon={Microscope} columns={columnGroups.omics} />
        <AccordionSection title="Clinical Research" icon={ShieldAlert} columns={columnGroups.clinical} />
        <AccordionSection title="Geographic & Environmental" icon={Map} columns={columnGroups.geographic} />
        <AccordionSection title="Experimental Metadata & Regulatory" icon={FileText} columns={columnGroups.metadata} />
        <AccordionSection title="Generic Variables" icon={BarChart3} columns={columnGroups.generic} />
        <AccordionSection title="Ignored Columns" icon={Link2} columns={columnGroups.ignored} />
      </Accordion.Root>

      <div className="flex justify-end mt-8">
        <button onClick={handleSaveMappings} className="flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-black font-semibold text-sm transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-[0_4px_14px_rgba(255,255,255,0.15)] hover:shadow-[0_6px_20px_rgba(255,255,255,0.25)]">
          Confirm & Proceed <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
