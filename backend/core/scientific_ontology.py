import re
from typing import Dict, Any, List

# Pre-compiled regex patterns for chemical identifiers
CAS_REGEX = re.compile(r"^\d{2,7}-\d{2}-\d$")
INCHI_REGEX = re.compile(r"^inchi=1s?/[a-z0-9\.]+/.*", re.IGNORECASE)
INCHIKEY_REGEX = re.compile(r"^[a-z]{14}-[a-z]{10}-[a-z\d]$", re.IGNORECASE)
SMILES_HEURISTIC_REGEX = re.compile(r"^(?=[CHONSPFIClBrIH])(?=.*[a-zA-Z])[a-zA-Z0-9\(\)\=\#\+\-\[\]\/\@\.\:\\]+$")
SPECIES_NOMENCLATURE_REGEX = re.compile(r"^[A-Z][a-z]+ [a-z]+$")
ENDPOINT_TYPICAL_REGEX = re.compile(r"^(LC|EC|IC|LD|ED)50$|^NOEC$|^LOEC$", re.IGNORECASE)

SCIENTIFIC_VARIABLES: Dict[str, Dict[str, Any]] = {
    # ── 1. CHEMICAL IDENTITY VARIABLES ──────────────────────────────────────────
    "chemical_name": {
        "aliases": ["chemical name", "chemical_name", "chemical", "chem name", "iupac name", "synonym"],
        "regex": [], "priority": 85, "category": "chemical_identity", "label": "Chemical Name"
    },
    "compound_name": {
        "aliases": ["compound name", "compound_name", "compound", "preferred compound name"],
        "regex": [], "priority": 85, "category": "chemical_identity", "label": "Compound Name"
    },
    "substance_name": {
        "aliases": ["substance name", "substance_name", "substance"],
        "regex": [], "priority": 80, "category": "chemical_identity", "label": "Substance Name"
    },
    "drug_name": {
        "aliases": ["drug name", "drug_name", "drug", "therapeutic agent", "medicine name"],
        "regex": [], "priority": 85, "category": "chemical_identity", "label": "Drug Name"
    },
    "molecule_name": {
        "aliases": ["molecule name", "molecule_name", "molecule", "molecular_structure_name"],
        "regex": [], "priority": 80, "category": "chemical_identity", "label": "Molecule Name"
    },
    "analyte": {
        "aliases": ["analyte", "analyte name", "target analyte", "measured substance"],
        "regex": [], "priority": 80, "category": "chemical_identity", "label": "Analyte"
    },
    "ingredient": {
        "aliases": ["ingredient", "excipient", "component name"],
        "regex": [], "priority": 75, "category": "chemical_identity", "label": "Ingredient"
    },
    "active_ingredient": {
        "aliases": ["active ingredient", "active_ingredient", "active substance", "api_name"],
        "regex": [], "priority": 85, "category": "chemical_identity", "label": "Active Ingredient"
    },
    "test_substance": {
        "aliases": ["test substance", "test_substance", "test chemical", "study chemical"],
        "regex": [], "priority": 85, "category": "chemical_identity", "label": "Test Substance"
    },
    "test_material": {
        "aliases": ["test material", "test_material", "experimental material"],
        "regex": [], "priority": 80, "category": "chemical_identity", "label": "Test Material"
    },
    "study_material": {
        "aliases": ["study material", "study_material", "study substance", "analyzed material"],
        "regex": [], "priority": 80, "category": "chemical_identity", "label": "Study Material"
    },

    # ── 2. STRUCTURE VARIABLES ──────────────────────────────────────────────────
    "smiles": {
        "aliases": ["smiles", "canonical smiles", "canonical_smiles", "smiles string", "isomeric smiles", "structure"],
        "regex": [SMILES_HEURISTIC_REGEX], "priority": 100, "category": "structure", "label": "SMILES Structure"
    },
    "inchi": {
        "aliases": ["inchi", "inchi string", "inchi code", "inchi-code", "inchi_string"],
        "regex": [INCHI_REGEX], "priority": 95, "category": "structure", "label": "InChI Code"
    },
    "inchikey": {
        "aliases": ["inchikey", "inchi key", "inchi-key", "inchikey_string"],
        "regex": [INCHIKEY_REGEX], "priority": 98, "category": "structure", "label": "InChIKey"
    },
    "molfile": {
        "aliases": ["molfile", "mol block", "molblock", "sdfile", "sdf block"],
        "regex": [], "priority": 90, "category": "structure", "label": "Molfile / SDF Block"
    },
    "sdf": {
        "aliases": ["sdf", "sdf file", "sdf block data"],
        "regex": [], "priority": 90, "category": "structure", "label": "SDF Payload"
    },

    # ── 3. CHEMICAL IDENTIFIER VARIABLES ───────────────────────────────────────
    "cas": {
        "aliases": ["cas", "cas number", "cas_number", "cas_no", "cas_rn", "casrn", "registry_number"],
        "regex": [CAS_REGEX], "priority": 95, "category": "chemical_identifier", "label": "CAS Number"
    },
    "cid": {
        "aliases": ["cid", "pubchem cid", "pubchem_cid", "pubchem compound id"],
        "regex": [], "priority": 85, "category": "chemical_identifier", "label": "PubChem CID"
    },
    "chembl_id": {
        "aliases": ["chembl id", "chembl_id", "chembl", "chembl target id"],
        "regex": [re.compile(r"^chembl\d+$", re.IGNORECASE)], "priority": 85, "category": "chemical_identifier", "label": "ChEMBL ID"
    },
    "pubchem_id": {
        "aliases": ["pubchem id", "pubchem_id", "pubchem sid", "pubchem_sid"],
        "regex": [], "priority": 85, "category": "chemical_identifier", "label": "PubChem ID"
    },
    "dsstox_id": {
        "aliases": ["dsstox", "dsstox id", "dsstox_id", "dtxsid", "dtxcid", "epa_dsstox"],
        "regex": [re.compile(r"^dtxsid\d+$", re.IGNORECASE)], "priority": 85, "category": "chemical_identifier", "label": "DSSTox ID"
    },
    "ec_number": {
        "aliases": ["ec number", "ec_number", "ec-no", "ec_no"],
        "regex": [], "priority": 85, "category": "chemical_identifier", "label": "EC Number"
    },
    "einecs": {
        "aliases": ["einecs", "einecs number", "einecs_number", "einecs_no"],
        "regex": [], "priority": 85, "category": "chemical_identifier", "label": "EINECS"
    },
    "unii": {
        "aliases": ["unii", "unii code", "unique ingredient identifier"],
        "regex": [], "priority": 85, "category": "chemical_identifier", "label": "UNII Code"
    },
    "drugbank_id": {
        "aliases": ["drugbank id", "drugbank_id", "drugbank"],
        "regex": [re.compile(r"^db\d+$", re.IGNORECASE)], "priority": 85, "category": "chemical_identifier", "label": "DrugBank ID"
    },
    "chebi_id": {
        "aliases": ["chebi", "chebi id", "chebi_id", "chebi_key"],
        "regex": [re.compile(r"^chebi:\d+$", re.IGNORECASE)], "priority": 85, "category": "chemical_identifier", "label": "ChEBI ID"
    },

    # ── 4. SPECIES VARIABLES ────────────────────────────────────────────────────
    "species": {
        "aliases": ["species", "exposed species", "exposed_species", "species name", "species_name"],
        "regex": [SPECIES_NOMENCLATURE_REGEX], "priority": 90, "category": "species", "label": "Species Name"
    },
    "organism": {
        "aliases": ["organism", "organism name", "organism_name", "test organism", "exposed organism"],
        "regex": [], "priority": 90, "category": "species", "label": "Exposed Organism"
    },
    "taxon": {
        "aliases": ["taxon", "taxonomic name", "scientific name", "taxa"],
        "regex": [], "priority": 85, "category": "species", "label": "Taxonomic Class"
    },
    "test_species": {
        "aliases": ["test species", "test_species", "biological model species"],
        "regex": [], "priority": 90, "category": "species", "label": "Test Species"
    },
    "host_species": {
        "aliases": ["host species", "host_species", "host organism"],
        "regex": [], "priority": 80, "category": "species", "label": "Host Species"
    },
    "exposed_species": {
        "aliases": ["exposed species", "exposed_species", "treated species"],
        "regex": [], "priority": 90, "category": "species", "label": "Exposed Species"
    },
    "target_species": {
        "aliases": ["target species", "target_species", "biological target species"],
        "regex": [], "priority": 90, "category": "species", "label": "Target Species"
    },

    # ── 5. TAXONOMY VARIABLES ───────────────────────────────────────────────────
    "kingdom": {
        "aliases": ["kingdom", "biological kingdom", "domain"],
        "regex": [], "priority": 80, "category": "taxonomy", "label": "Kingdom"
    },
    "phylum": {
        "aliases": ["phylum", "division"],
        "regex": [], "priority": 80, "category": "taxonomy", "label": "Phylum"
    },
    "class": {
        "aliases": ["class", "taxonomic class", "biological class"],
        "regex": [], "priority": 80, "category": "taxonomy", "label": "Taxonomic Class"
    },
    "order": {
        "aliases": ["order", "taxonomic order", "biological order"],
        "regex": [], "priority": 80, "category": "taxonomy", "label": "Order"
    },
    "family": {
        "aliases": ["family", "biological family", "taxonomic family"],
        "regex": [], "priority": 80, "category": "taxonomy", "label": "Family"
    },
    "genus": {
        "aliases": ["genus", "genus name", "genus_name"],
        "regex": [], "priority": 80, "category": "taxonomy", "label": "Genus"
    },
    "strain": {
        "aliases": ["strain", "microbial strain", "viral strain", "genetic strain"],
        "regex": [], "priority": 80, "category": "taxonomy", "label": "Organism Strain"
    },

    # ── 6. EXPOSURE VARIABLES ───────────────────────────────────────────────────
    "exposure_duration": {
        "aliases": ["exposure duration", "exposure_duration", "duration", "study length", "study_length"],
        "regex": [], "priority": 85, "category": "exposure", "label": "Exposure Duration"
    },
    "exposure_time": {
        "aliases": ["exposure time", "exposure_time", "contact time", "contact_time"],
        "regex": [], "priority": 85, "category": "exposure", "label": "Exposure Time"
    },
    "contact_time": {
        "aliases": ["contact time", "contact_time", "incubation time", "incubation_time"],
        "regex": [], "priority": 80, "category": "exposure", "label": "Contact Time"
    },
    "observation_period": {
        "aliases": ["observation period", "observation_period", "monitoring window", "timepoints"],
        "regex": [], "priority": 80, "category": "exposure", "label": "Observation Period"
    },
    "treatment_duration": {
        "aliases": ["treatment duration", "treatment_duration", "dosing duration", "dosing_duration"],
        "regex": [], "priority": 85, "category": "exposure", "label": "Treatment Duration"
    },

    # ── 7. CONCENTRATION VARIABLES ──────────────────────────────────────────────
    "concentration": {
        "aliases": ["concentration", "conc", "exposure concentration", "exposure_concentration"],
        "regex": [], "priority": 90, "category": "concentration", "label": "Concentration"
    },
    "dose": {
        "aliases": ["dose", "dosage", "dose level", "dosing level", "administered dose", "administered_dose"],
        "regex": [], "priority": 90, "category": "concentration", "label": "Dose Level"
    },
    "administered_dose": {
        "aliases": ["administered dose", "administered_dose", "ingested dose", "injected dose"],
        "regex": [], "priority": 90, "category": "concentration", "label": "Administered Dose"
    },
    "exposure_concentration": {
        "aliases": ["exposure concentration", "exposure_concentration", "medium concentration", "media concentration"],
        "regex": [], "priority": 90, "category": "concentration", "label": "Exposure Concentration"
    },
    "test_concentration": {
        "aliases": ["test concentration", "test_concentration", "treatment concentration", "spike concentration"],
        "regex": [], "priority": 90, "category": "concentration", "label": "Test Concentration"
    },

    # ── 8. ENDPOINT VARIABLES ───────────────────────────────────────────────────
    "endpoint": {
        "aliases": ["endpoint", "toxicity endpoint", "toxicity_endpoint", "lethal endpoint"],
        "regex": [ENDPOINT_TYPICAL_REGEX], "priority": 95, "category": "endpoint", "label": "Toxicity Endpoint"
    },
    "effect": {
        "aliases": ["effect", "observed effect", "observed_effect", "effect measure"],
        "regex": [], "priority": 85, "category": "endpoint", "label": "Biological Effect"
    },
    "response": {
        "aliases": ["response", "response variable", "measured response", "assay response"],
        "regex": [], "priority": 85, "category": "endpoint", "label": "Assay Response"
    },
    "outcome": {
        "aliases": ["outcome", "experimental outcome", "clinical outcome", "study outcome"],
        "regex": [], "priority": 85, "category": "endpoint", "label": "Study Outcome"
    },
    "measurement": {
        "aliases": ["measurement", "continuous measurement", "observation", "metric value"],
        "regex": [], "priority": 80, "category": "endpoint", "label": "Continuous Measurement"
    },
    "toxicity_endpoint": {
        "aliases": ["toxicity endpoint", "toxicity_endpoint", "toxicological endpoint", "toxicological_endpoint"],
        "regex": [], "priority": 95, "category": "endpoint", "label": "Toxicological Endpoint"
    },

    # ── 9. UNITS VARIABLES ──────────────────────────────────────────────────────
    "unit": {
        "aliases": ["unit", "measurement unit", "measurement_unit", "units"],
        "regex": [], "priority": 75, "category": "units", "label": "Measurement Unit"
    },
    "dose_unit": {
        "aliases": ["dose unit", "dose_unit", "dosage unit", "dosage_unit", "mg_kg"],
        "regex": [], "priority": 80, "category": "units", "label": "Dosing Unit"
    },
    "concentration_unit": {
        "aliases": ["concentration unit", "concentration_unit", "conc unit", "conc_unit", "mg_l", "ppm", "ppb", "ug_l"],
        "regex": [], "priority": 80, "category": "units", "label": "Concentration Unit"
    },
    "time_unit": {
        "aliases": ["time unit", "time_unit", "duration unit", "duration_unit", "hours", "days"],
        "regex": [], "priority": 80, "category": "units", "label": "Time Unit"
    },

    # ── 10. STUDY DESIGN VARIABLES ──────────────────────────────────────────────
    "test_type": {
        "aliases": ["test type", "test_type", "study type", "study_type", "acute", "chronic"],
        "regex": [], "priority": 80, "category": "study_design", "label": "Test / Study Type"
    },
    "study_type": {
        "aliases": ["study type", "study_type", "experiment type", "experiment_type"],
        "regex": [], "priority": 80, "category": "study_design", "label": "Study Format"
    },
    "study_design": {
        "aliases": ["study design", "study_design", "experimental design", "experimental_design"],
        "regex": [], "priority": 80, "category": "study_design", "label": "Study Design"
    },
    "protocol": {
        "aliases": ["protocol", "study protocol", "experimental protocol", "test protocol"],
        "regex": [], "priority": 80, "category": "study_design", "label": "Study Protocol"
    },
    "assay_type": {
        "aliases": ["assay type", "assay_type", "assay format", "assay_format"],
        "regex": [], "priority": 80, "category": "study_design", "label": "Assay Format"
    },

    # ── 11. BIOLOGICAL EFFECT VARIABLES ─────────────────────────────────────────
    "mortality": {
        "aliases": ["mortality", "lethality", "death rate", "survival rate", "survival_rate"],
        "regex": [], "priority": 85, "category": "biological_effect", "label": "Mortality Rate"
    },
    "growth": {
        "aliases": ["growth", "growth rate", "growth_rate", "body weight", "body_weight"],
        "regex": [], "priority": 80, "category": "biological_effect", "label": "Growth Rate"
    },
    "reproduction": {
        "aliases": ["reproduction", "fecundity", "brood size", "brood_size", "fertility"],
        "regex": [], "priority": 80, "category": "biological_effect", "label": "Reproduction Output"
    },
    "development": {
        "aliases": ["development", "developmental toxicity", "hatching rate", "malformation"],
        "regex": [], "priority": 80, "category": "biological_effect", "label": "Developmental Indicator"
    },
    "survival": {
        "aliases": ["survival", "survival percentage", "viability"],
        "regex": [], "priority": 85, "category": "biological_effect", "label": "Survival viability"
    },
    "behavior": {
        "aliases": ["behavior", "behaviour", "mobility", "locomotion", "avoidance"],
        "regex": [], "priority": 75, "category": "biological_effect", "label": "Locomotion / Behavior"
    },

    # ── 12. CLINICAL VARIABLES ──────────────────────────────────────────────────
    "patient_id": {
        "aliases": ["patient id", "patient_id", "patient", "participant", "participant_id"],
        "regex": [], "priority": 70, "category": "clinical", "label": "Patient ID"
    },
    "subject_id": {
        "aliases": ["subject id", "subject_id", "subject", "subjid"],
        "regex": [], "priority": 70, "category": "clinical", "label": "Subject ID"
    },
    "cohort": {
        "aliases": ["cohort", "study cohort", "patient cohort"],
        "regex": [], "priority": 70, "category": "clinical", "label": "Cohort Group"
    },
    "treatment_arm": {
        "aliases": ["treatment arm", "treatment_arm", "dosing arm", "study arm"],
        "regex": [], "priority": 70, "category": "clinical", "label": "Treatment Arm"
    },
    "sex": {
        "aliases": ["sex", "gender", "biological sex", "male", "female"],
        "regex": [], "priority": 60, "category": "clinical", "label": "Biological Sex"
    },
    "age": {
        "aliases": ["age", "subject age", "patient age", "life stage"],
        "regex": [], "priority": 60, "category": "clinical", "label": "Subject Age"
    },
    "race": {
        "aliases": ["race", "demographic race"],
        "regex": [], "priority": 60, "category": "clinical", "label": "Subject Race"
    },
    "ethnicity": {
        "aliases": ["ethnicity", "ethnic origin"],
        "regex": [], "priority": 60, "category": "clinical", "label": "Subject Ethnicity"
    },

    # ── 13. OMICS VARIABLES ─────────────────────────────────────────────────────
    "gene": {
        "aliases": ["gene", "gene id", "gene_id", "gene symbol", "gene_symbol", "ensembl"],
        "regex": [], "priority": 70, "category": "omics", "label": "Gene Identifier"
    },
    "transcript": {
        "aliases": ["transcript", "transcript id", "transcript_id", "mrna"],
        "regex": [], "priority": 70, "category": "omics", "label": "Transcript"
    },
    "protein": {
        "aliases": ["protein", "protein name", "protein_name", "uniprot", "polypeptide"],
        "regex": [], "priority": 70, "category": "omics", "label": "Protein Name"
    },
    "metabolite": {
        "aliases": ["metabolite", "metabolite name", "metabolite_id"],
        "regex": [], "priority": 70, "category": "omics", "label": "Metabolite"
    },
    "pathway": {
        "aliases": ["pathway", "pathway name", "pathway_id", "biological pathway"],
        "regex": [], "priority": 70, "category": "omics", "label": "Pathway"
    },

    # ── 14. ENVIRONMENTAL VARIABLES ─────────────────────────────────────────────
    "water_type": {
        "aliases": ["water type", "water_type", "freshwater", "saltwater", "marine water"],
        "regex": [], "priority": 80, "category": "environmental", "label": "Water Type"
    },
    "soil_type": {
        "aliases": ["soil type", "soil_type", "soil category", "loam", "silt", "clay"],
        "regex": [], "priority": 80, "category": "environmental", "label": "Soil Composition"
    },
    "sediment_type": {
        "aliases": ["sediment type", "sediment_type", "sediment content"],
        "regex": [], "priority": 80, "category": "environmental", "label": "Sediment Profile"
    },
    "habitat": {
        "aliases": ["habitat", "ecological habitat", "ecosystem type"],
        "regex": [], "priority": 80, "category": "environmental", "label": "Ecological Habitat"
    },
    "location": {
        "aliases": ["location", "media location", "matrix source"],
        "regex": [], "priority": 75, "category": "environmental", "label": "Sampling Location"
    },

    # ── 15. GEOGRAPHIC VARIABLES ────────────────────────────────────────────────
    "country": {
        "aliases": ["country", "nation"],
        "regex": [], "priority": 70, "category": "geographic", "label": "Country"
    },
    "region": {
        "aliases": ["region", "state", "province", "territory"],
        "regex": [], "priority": 70, "category": "geographic", "label": "Region"
    },
    "site": {
        "aliases": ["site", "sampling site", "sampling_site", "collection site", "collection_site"],
        "regex": [], "priority": 70, "category": "geographic", "label": "Sampling Site"
    },
    "station": {
        "aliases": ["station", "monitoring station", "collection station"],
        "regex": [], "priority": 70, "category": "geographic", "label": "Monitoring Station"
    },
    "latitude": {
        "aliases": ["latitude", "lat", "gps latitude", "coordinates latitude"],
        "regex": [], "priority": 75, "category": "geographic", "label": "Latitude"
    },
    "longitude": {
        "aliases": ["longitude", "lon", "lng", "gps longitude"],
        "regex": [], "priority": 75, "category": "geographic", "label": "Longitude"
    },

    # ── 16. REGULATORY VARIABLES ────────────────────────────────────────────────
    "guideline": {
        "aliases": ["guideline", "test guideline", "test_guideline", "oecd guideline", "oecd"],
        "regex": [], "priority": 80, "category": "regulatory", "label": "Test Guideline"
    },
    "authority": {
        "aliases": ["authority", "regulatory authority", "epa", "reach", "fda", "ich"],
        "regex": [], "priority": 80, "category": "regulatory", "label": "Regulatory Authority"
    },
    "regulation": {
        "aliases": ["regulation", "governing law", "regulatory classification"],
        "regex": [], "priority": 80, "category": "regulatory", "label": "Governing Regulation"
    },
    "classification": {
        "aliases": ["classification", "hazard class", "ghs category", "hazard category"],
        "regex": [], "priority": 80, "category": "regulatory", "label": "Hazard Classification"
    },

    # ── 17. DESCRIPTOR VARIABLES ────────────────────────────────────────────────
    "descriptor": {
        "aliases": ["descriptor", "qsar descriptor", "molecular descriptor", "mw", "logp", "tpsa"],
        "regex": [], "priority": 70, "category": "descriptors", "label": "QSAR Descriptor"
    },
    "fingerprint": {
        "aliases": ["fingerprint", "molecular fingerprint", "ecfp4", "maccs"],
        "regex": [], "priority": 70, "category": "descriptors", "label": "Molecular Fingerprint"
    },
    "feature": {
        "aliases": ["feature", "qsar feature", "machine learning feature"],
        "regex": [], "priority": 70, "category": "descriptors", "label": "QSAR Feature"
    },
    "molecular_property": {
        "aliases": ["molecular property", "molecular_property", "physicochemical property"],
        "regex": [], "priority": 70, "category": "descriptors", "label": "Molecular Property"
    },

    # ── 18. ACTIVITY VARIABLES ──────────────────────────────────────────────────
    "activity": {
        "aliases": ["activity", "biological activity", "activity score", "binding activity"],
        "regex": [], "priority": 85, "category": "activity", "label": "Bioactivity State"
    },
    "potency": {
        "aliases": ["potency", "absolute potency", "pic50", "pec50", "potency value"],
        "regex": [], "priority": 85, "category": "activity", "label": "Biological Potency"
    },
    "binding": {
        "aliases": ["binding", "receptor binding", "binding affinity", "binding ratio"],
        "regex": [], "priority": 85, "category": "activity", "label": "Receptor Binding"
    },
    "affinity": {
        "aliases": ["affinity", "binding affinity", "ki", "kd", "dissociation constant"],
        "regex": [], "priority": 85, "category": "activity", "label": "Binding Affinity"
    },

    # ── UNKNOWN BUT USABLE VARIABLE ─────────────────────────────────────────────
    "generic_variable": {
        "aliases": ["generic", "metadata", "other", "unknown", "usable", "none"],
        "regex": [], "priority": 50, "category": "metadata", "label": "Generic Metadata Variable"
    }
}

# Flat registry mapping for backward compatibility and fast lookups
UNIVERSAL_ONTOLOGY: Dict[str, List[str]] = {}
for standard_key, meta in SCIENTIFIC_VARIABLES.items():
    UNIVERSAL_ONTOLOGY[standard_key] = list(meta["aliases"])
