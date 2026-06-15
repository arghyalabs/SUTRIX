from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, JSON, Text
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class CompoundRegistry(Base):
    __tablename__ = 'compound_registry'
    id = Column(Integer, primary_key=True, autoincrement=True)
    compound_name = Column(String, index=True)
    canonical_smiles = Column(String, index=True)
    inchi_key = Column(String, unique=True, index=True)
    cas_number = Column(String, index=True)
    pubchem_cid = Column(String, index=True)
    molecular_formula = Column(String)
    molecular_weight = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    descriptors = relationship("DescriptorRegistry", back_populates="compound", uselist=False)
    enrichment = relationship("EnrichmentHistory", back_populates="compound", uselist=False)
    workflow_outputs = relationship("WorkflowOutput", back_populates="compound")

class DescriptorRegistry(Base):
    __tablename__ = 'descriptor_registry'
    compound_id = Column(Integer, ForeignKey('compound_registry.id'), primary_key=True)
    logp = Column(Float)
    tpsa = Column(Float)
    h_bond_donors = Column(Integer)
    h_bond_acceptors = Column(Integer)
    rotatable_bonds = Column(Integer)
    fingerprints = Column(String)  
    molecular_descriptors_json = Column(JSON)
    
    compound = relationship("CompoundRegistry", back_populates="descriptors")

class EnrichmentHistory(Base):
    __tablename__ = 'enrichment_history'
    compound_id = Column(Integer, ForeignKey('compound_registry.id'), primary_key=True)
    pubchem_data = Column(JSON)
    chembl_data = Column(JSON)
    pubmed_data = Column(JSON)
    fetch_status = Column(String)
    last_fetched = Column(DateTime, default=datetime.utcnow)
    
    compound = relationship("CompoundRegistry", back_populates="enrichment")

class FailedFetch(Base):
    __tablename__ = 'failed_fetches'
    id = Column(Integer, primary_key=True, autoincrement=True)
    identifier = Column(String, index=True)
    identifier_type = Column(String) # e.g. "SMILES", "InChIKey", "Name"
    source = Column(String) # e.g. "PubChem", "ChEMBL", "RDKit"
    error_message = Column(Text)
    failed_at = Column(DateTime, default=datetime.utcnow)

class WorkflowOutput(Base):
    __tablename__ = 'workflow_outputs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    workflow_id = Column(String, index=True)
    compound_id = Column(Integer, ForeignKey('compound_registry.id'))
    segregation_category = Column(String)
    endpoint = Column(String)
    export_reference = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    compound = relationship("CompoundRegistry", back_populates="workflow_outputs")

class Workspace(Base):
    __tablename__ = 'workspaces'
    workspace_id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    dataset_mode = Column(String, nullable=False)  # MOLECULAR, CLINICAL, SURVEY, DOE, QSAR
    user_persona = Column(String, nullable=False)  # TOXICOLOGIST, CLINICAL, SOCIAL, FORMULATION
    active_branch_id = Column(String, nullable=False, default='main')
    created_at = Column(DateTime, default=datetime.utcnow)

    branches = relationship("WorkspaceBranch", back_populates="workspace", cascade="all, delete-orphan")
    events = relationship("WorkflowEvent", back_populates="workspace", cascade="all, delete-orphan")

class WorkspaceBranch(Base):
    __tablename__ = 'workspace_branches'
    branch_id = Column(String, primary_key=True)
    workspace_id = Column(String, ForeignKey('workspaces.workspace_id'), nullable=False)
    name = Column(String, nullable=False)  # main, test_group_b, etc.
    parent_event_id = Column(String, nullable=True)  # event_id at which branching occurred
    created_at = Column(DateTime, default=datetime.utcnow)

    workspace = relationship("Workspace", back_populates="branches")
    events = relationship("WorkflowEvent", back_populates="branch")

class WorkflowEvent(Base):
    __tablename__ = 'workflow_events'
    event_id = Column(String, primary_key=True)
    workspace_id = Column(String, ForeignKey('workspaces.workspace_id'), nullable=False)
    branch_id = Column(String, ForeignKey('workspace_branches.branch_id'), nullable=False)
    sequence_order = Column(Integer, nullable=False)
    timestamp = Column(Float, nullable=False)
    action_type = Column(String, nullable=False)  # INGEST, CLEAN, STATS_TEST, RUN_QSAR, etc.
    payload = Column(JSON, nullable=False)  # JSON parameters and state diff
    signature_hash = Column(String, nullable=False)  # SHA-256 state signature

    workspace = relationship("Workspace", back_populates="events")
    branch = relationship("WorkspaceBranch", back_populates="events")
