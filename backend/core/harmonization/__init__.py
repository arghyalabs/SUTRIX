"""
backend/core/harmonization/__init__.py

Cross-Studio Data Reduction Control & Audit Framework.
Provides scientist-driven control over variance conflict filtration
and smart duplicate segregation, with full transparency and auditability.
"""
from .reduction_models import (
    VarianceConflictStrategy,
    DuplicateSegregationStrategy,
    HarmonizationSettings,
    VariancePruningAudit,
    DuplicateSegregationAudit,
    HarmonizationAudit,
)
from .harmonization_engine import HarmonizationEngine

__all__ = [
    "VarianceConflictStrategy",
    "DuplicateSegregationStrategy",
    "HarmonizationSettings",
    "VariancePruningAudit",
    "DuplicateSegregationAudit",
    "HarmonizationAudit",
    "HarmonizationEngine",
]
