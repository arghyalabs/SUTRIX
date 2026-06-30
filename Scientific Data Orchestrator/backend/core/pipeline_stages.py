"""
backend/core/pipeline_stages.py

Universal pipeline stage definitions and metadata for the SUTRIX platform.
Every operation in the system maps to one of these stages, enabling unified
telemetry, ETA estimation, and progressive frontend rendering.
"""
from enum import Enum
from dataclasses import dataclass
from typing import Optional


class PipelineStage(str, Enum):
    IDLE               = "IDLE"
    UPLOADING          = "UPLOADING"
    PARSING            = "PARSING"
    SCHEMA_DETECTION   = "SCHEMA_DETECTION"
    UNIT_STANDARDIZE   = "UNIT_STANDARDIZE"
    DEDUPLICATION      = "DEDUPLICATION"
    SMILES_RESOLVE     = "SMILES_RESOLVE"
    PREVIEW_CACHE      = "PREVIEW_CACHE"
    STATISTICS_BUILD   = "STATISTICS_BUILD"
    WORKSPACE_READY    = "WORKSPACE_READY"
    HIERARCHY_INIT     = "HIERARCHY_INIT"
    HIERARCHY_BUILD    = "HIERARCHY_BUILD"
    NODE_STATISTICS    = "NODE_STATISTICS"
    CHART_PRECOMPUTE   = "CHART_PRECOMPUTE"
    IDENTITY_RESOLVE   = "IDENTITY_RESOLVE"
    DESCRIPTOR_COMPUTE = "DESCRIPTOR_COMPUTE"
    COLUMNAR_COMPRESS  = "COLUMNAR_COMPRESS"
    EXPORT_GENERATION  = "EXPORT_GENERATION"
    COMPLETED          = "COMPLETED"
    FAILED             = "FAILED"
    CANCELLED          = "CANCELLED"
    RESUMING           = "RESUMING"


@dataclass
class StageMetadata:
    stage: PipelineStage
    label: str
    description: str
    icon: str
    # Relative weight in total pipeline (used for ETA blending)
    weight: float = 1.0
    # Which broader operation this belongs to
    operation: str = "upload"


# Full stage registry — order matters for timeline display
STAGE_REGISTRY: list[StageMetadata] = [
    # --- Upload pipeline ---
    StageMetadata(PipelineStage.UPLOADING,        "Uploading",             "Receiving file bytes...",                         "upload",       0.5,  "upload"),
    StageMetadata(PipelineStage.PARSING,          "Parsing Dataset",       "Reading and validating scientific data...",        "file-text",    1.0,  "upload"),
    StageMetadata(PipelineStage.SCHEMA_DETECTION, "Detecting Schema",      "Identifying toxicological variable columns...",    "search",       0.8,  "upload"),
    StageMetadata(PipelineStage.UNIT_STANDARDIZE, "Standardizing Units",   "Normalizing measurement units and qualifiers...", "ruler",        0.5,  "upload"),
    StageMetadata(PipelineStage.DEDUPLICATION,    "Deduplicating Records", "Removing duplicate chemical entries...",           "copy",         0.5,  "upload"),
    StageMetadata(PipelineStage.SMILES_RESOLVE,   "Canonicalizing SMILES", "Resolving chemical structure coordinates...",      "atom",         0.5,  "upload"),
    StageMetadata(PipelineStage.PREVIEW_CACHE,    "Building Preview",      "Preparing interactive data preview...",            "table",        0.3,  "upload"),
    StageMetadata(PipelineStage.STATISTICS_BUILD, "Generating Statistics", "Computing column-level statistics...",             "bar-chart",    0.5,  "upload"),
    StageMetadata(PipelineStage.WORKSPACE_READY,  "Workspace Ready",       "Dataset fully preprocessed and cached.",          "check-circle", 0.1,  "upload"),

    # --- Hierarchy pipeline ---
    StageMetadata(PipelineStage.HIERARCHY_INIT,   "Initializing Hierarchy","Preparing hierarchy branching engine...",          "git-branch",   0.3,  "hierarchy"),
    StageMetadata(PipelineStage.HIERARCHY_BUILD,  "Building Hierarchy",    "Generating toxicological node tree...",            "network",      3.0,  "hierarchy"),
    StageMetadata(PipelineStage.NODE_STATISTICS,  "Node Statistics",       "Computing per-branch endpoint statistics...",      "bar-chart-2",  1.5,  "hierarchy"),
    StageMetadata(PipelineStage.CHART_PRECOMPUTE, "Preparing Charts",      "Pre-rendering visualization payloads...",          "pie-chart",    1.0,  "hierarchy"),
    StageMetadata(PipelineStage.EXPORT_GENERATION,"Generating Exports",    "Packaging curated dataset exports as ZIP...",      "package",      0.5,  "hierarchy"),

    # --- Enrichment pipeline ---
    StageMetadata(PipelineStage.IDENTITY_RESOLVE, "Identity Resolution",   "Resolving compound identifiers & SMILES...",       "dna",          2.0,  "enrichment"),
    StageMetadata(PipelineStage.DESCRIPTOR_COMPUTE,"Descriptor Computation","Computing RDKit & Mordred molecular features...", "flask",        5.0,  "enrichment"),
    StageMetadata(PipelineStage.COLUMNAR_COMPRESS, "Columnar Compression", "Compressing enriched dataset to Parquet...",       "compress",     0.5,  "enrichment"),
]

# Lookup helpers
_STAGE_MAP: dict[PipelineStage, StageMetadata] = {s.stage: s for s in STAGE_REGISTRY}


def get_stage_meta(stage: PipelineStage) -> Optional[StageMetadata]:
    return _STAGE_MAP.get(stage)


def get_upload_stages() -> list[StageMetadata]:
    return [s for s in STAGE_REGISTRY if s.operation == "upload"]


def get_hierarchy_stages() -> list[StageMetadata]:
    return [s for s in STAGE_REGISTRY if s.operation == "hierarchy"]


def get_enrichment_stages() -> list[StageMetadata]:
    return [s for s in STAGE_REGISTRY if s.operation == "enrichment"]
