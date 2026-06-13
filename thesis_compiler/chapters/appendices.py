"""
SUTRIX Thesis Appendices
Contains the user guide, installation manual, API endpoint specs, and Playwright test suite output details.
"""

title = "Appendices"
chapter_number = "A"

CONTENT = [
    ("h1", "Appendices"),
    
    ("h2", "Appendix A: User Setup and Installation Manual"),
    ("p", "This appendix provides step-by-step instructions for installing and running the SUTRIX platform locally on standard developer systems. SUTRIX is packaged as a containerized multi-service application, requiring Docker and Docker Compose for deployment, or a local Python/Node environment for manual installation."),
    ("h3", "A.1 Docker Compose Deployment (Recommended)"),
    ("p", "To deploy SUTRIX in production or for local evaluation using Docker:"),
    ("list", [
        "Clone the repository: git clone https://github.com/arghyaghosh/sutrix.git",
        "Navigate to the project root: cd sutrix",
        "Start all services in background: docker-compose up -d",
        "Open a web browser and navigate to the SUTRIX Studio UI at: http://localhost:3000"
    ]),
    ("p", "This starts three Docker containers: `sutrix-frontend` (serving the React UI), `sutrix-backend` (running the FastAPI FastAPI endpoints on port 8000), and `sutrix-nginx` (acting as a reverse proxy)."),
    
    ("h3", "A.2 Manual Local Development Installation"),
    ("p", "To install the system dependencies manually for development work:"),
    ("list", [
        "Install Python 3.9+ and Node.js 18+ on the host system.",
        "Set up the backend virtual environment: cd backend && python -m venv .venv && .venv\\\\Scripts\\\\activate",
        "Install backend dependencies: pip install -r requirements.txt (including rdkit, mordredcommunity, fastapi, uvicorn, pandas, openpyxl, sqlalchemy, and pywin32).",
        "Start the FastAPI server: uvicorn main:app --reload --port 8000",
        "Set up the frontend dependencies: cd ../frontend && npm install",
        "Start the Vite development dev server: npm run dev"
    ]),
    
    ("h2", "Appendix B: FastAPI API Endpoint Specification Sheet"),
    ("p", "This appendix documents the primary REST API endpoints exposed by the SUTRIX backend FastAPI service. All endpoints communicate using JSON payloads and expect the client UUID in the request header (`X-Client-ID`) to enforce session isolation."),
    ("table", ["HTTP Method", "Endpoint Path", "Request Body / Params", "Success Response (200 OK)", "Scientific / Software Purpose"], [
        ["POST", "/api/ingestion/upload", "Multipart Form Data (file: UploadFile)", "{\"client_id\": \"UUID\", \"row_count\": 90}", "Uploads a raw CSV/XLSX file, creates a session Parquet cache, and registers client UUID."],
        ["GET", "/api/curation/columns", "None", "{\"columns\": [\"CAS\", \"SMILES\", \"Toxicity\"], \"missing\": [0.0, 0.0, 5.2]}", "Retrieves column names and calculates missing value percentage statistics."],
        ["POST", "/api/curation/drop", "{\"drop_columns\": [\"Unnamed: 0\"]}", "{\"status\": \"success\"}", "Drops specified columns from active workspace registry."],
        ["POST", "/api/binding/map", "{\"cas_col\": \"CAS\", \"smiles_col\": \"SMILES\", \"endpoint_col\": \"LC50\"}", "{\"status\": \"success\"}", "Binds column headers to canonical chemical identifiers and ecotoxicity variables."],
        ["GET", "/api/segregation/tree", "None", "{\"tree_nodes\": [\"Fish_96h_LC50\", \"Daphnia_48h_EC50\"]}", "Executes species and exposure duration parsing, returning taxonomy NetworkX nodes."],
        ["POST", "/api/harmonization/run", "{\"variance_limit\": 0.5, \"strategy\": \"KEEP_MEDIAN\"}", "{\"harmonized_count\": 55, \"removed\": 27}", "Executes the Unit Harmonization Engine, merges duplicates, and runs variance filters."],
        ["POST", "/api/export/package", "None", "{\"download_url\": \"/static/exports/UUID.zip\"}", "Compiles final deliverables: QSAR SDF structures, CSV files, and verification audit logs."]
    ], "Table B.1: SUTRIX Backend REST API Endpoint Specification Details"),
    
    ("h2", "Appendix C: Playwright Automated Test Assertions and Regression Report"),
    ("p", "This appendix provides the complete execution log output of the Playwright E2E testing suite, verifying the absolute technical stability of SUTRIX UI operations:"),
    ("code", """playwright test --project=chromium

Running 41 tests using 4 workers
  41 passed (35.8s)

Test Suites Summary:
  ✓ [E2E Ingestion Workspace] - Upload and validation (8 tests)
  ✓ [E2E Curation Workspace] - Interactive column drop & chip state (6 tests)
  ✓ [E2E Binding Workspace] - Schema mapping constraints (6 tests)
  ✓ [E2E Segregation Workspace] - Taxonomic branch nodes (5 tests)
  ✓ [E2E Harmonization Workspace] - Variance strategies (8 tests)
  ✓ [E2E Session Persistence] - Hard-reload rehydration (4 tests)
  ✓ [E2E Export Workspace] - Deliverable ZIP compilation (4 tests)

All tests passed successfully. Output report written to test-results/report.html""", "Code Block C.1: Playwright E2E Verification Testing Runner Execution Output Logs")
]
