"""
SUTRIX Thesis Chapters Module
Exports all chapters in order for compilation.
"""

from . import preliminary
from . import chapter1_intro
from . import chapter2_lit_review
from . import chapter3_objectives
from . import chapter3a_novelty
from . import chapter4_design
from . import chapter5_methodology
from . import chapter6_implementation
from . import chapter7_results
from . import chapter8_discussion
from . import chapter8a_validation
from . import chapter9_conclusion
from . import appendices

CHAPTERS = [
    chapter1_intro,
    chapter2_lit_review,
    chapter3_objectives,
    chapter3a_novelty,
    chapter4_design,
    chapter5_methodology,
    chapter6_implementation,
    chapter7_results,
    chapter8_discussion,
    chapter8a_validation,
    chapter9_conclusion,
]
