import logging
import hashlib
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import Response

logger = logging.getLogger("sdo.api.render")
router = APIRouter(prefix="/api/render", tags=["render"])

# In-process SVG cache to avoid repeating expensive draws
_svg_cache: dict[str, str] = {}

@router.get("/structure")
async def render_structure(
    smiles: str = Query(..., description="SMILES string to render"),
    width: int = Query(300),
    height: int = Query(200),
    highlight_atoms: str = Query("", description="Comma-separated atom indices to highlight"),
    bg_color: str = Query("transparent")
):
    """
    Render a SMILES string as an SVG 2D molecular structure.
    SVGs are cached by canonical SMILES and drawing settings for 24 hours.
    """
    try:
        from rdkit import Chem
        from rdkit.Chem.Draw import rdMolDraw2D
    except ImportError:
        raise HTTPException(status_code=503, detail="RDKit is not available on this server.")

    # Generate a cache key
    cache_key = hashlib.md5(f"{smiles}:{width}:{height}:{highlight_atoms}:{bg_color}".encode()).hexdigest()
    if cache_key in _svg_cache:
        return Response(
            content=_svg_cache[cache_key],
            media_type="image/svg+xml",
            headers={"Cache-Control": "public, max-age=86400"}
        )

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        # Return a fallback/placeholder SVG for invalid SMILES
        placeholder = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">
          <rect width="{width}" height="{height}" fill="rgba(30,30,50,0.5)" rx="8"/>
          <text x="{width//2}" y="{height//2}" text-anchor="middle" fill="#f43f5e"
                font-family="monospace" font-size="11">Invalid SMILES</text>
        </svg>'''
        return Response(content=placeholder, media_type="image/svg+xml")

    # Parse highlights
    atom_ids = []
    if highlight_atoms:
        try:
            atom_ids = [int(x.strip()) for x in highlight_atoms.split(",") if x.strip()]
            # Keep only valid indices
            atom_ids = [a for a in atom_ids if 0 <= a < mol.GetNumAtoms()]
        except ValueError:
            atom_ids = []

    drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
    opts = drawer.drawOptions()
    opts.addStereoAnnotation = True
    opts.addAtomIndices = False
    opts.bondLineWidth = 1.5
    # atomLabelFontSize was removed in newer RDKit — guard against AttributeError
    try:
        opts.atomLabelFontSize = 0.35
    except AttributeError:
        pass

    if bg_color == "transparent":
        drawer.SetDrawBkg(False)
    else:
        drawer.SetDrawBkg(True)

    if atom_ids:
        atom_colors = {i: (0.95, 0.2, 0.2) for i in atom_ids}
        drawer.DrawMolecule(
            mol,
            highlightAtoms=atom_ids,
            highlightAtomColors=atom_colors,
            highlightBonds=[],
            highlightBondColors={}
        )
    else:
        drawer.DrawMolecule(mol)

    drawer.FinishDrawing()
    svg = drawer.GetDrawingText()

    # Cache the result
    _svg_cache[cache_key] = svg

    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=86400"}
    )
