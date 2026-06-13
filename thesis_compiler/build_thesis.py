"""
SUTRIX Thesis Master Compiler
Orchestrates figure generation, DOCX document compilation, PDF conversion via Word COM,
and LaTeX project generation. Runs strict integrity audits and outputs a Thesis Freeze Report.
"""

import os
import sys
import re

# Add current path to import thesis_compiler modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from thesis_compiler.chapters import CHAPTERS
from thesis_compiler.figure_generator import generate_all as generate_figures
from thesis_compiler.docx_builder import build_docx
from thesis_compiler.pdf_builder import convert_docx_to_pdf
from thesis_compiler.latex_builder import build_latex_project

CHAPTER_TARGETS = {
    "Chapter 1: Introduction": 8000,
    "Chapter 2: Literature Review": 12000,
    "Chapter 3: Objectives": 2000,
    "Chapter 3A: Novelty and Contributions": 3000,
    "Chapter 4: System Design and Architecture": 6000,
    "Chapter 5: Methodology": 10000,
    "Chapter 6: Implementation": 7000,
    "Chapter 7: Results and Evaluation": 6000,
    "Chapter 8: Discussion": 5000,
    "Chapter 8A: Software Verification and Validation": 3000,
    "Chapter 9: Conclusion & Future Scope": 2000
}

def calculate_word_count():
    """Audits the word count across all chapters in the thesis compiler and checks targets."""
    print("\n" + "="*50)
    print("SUTRIX THESIS MANUSCRIPT WORD COUNT AUDIT")
    print("="*50)
    
    total_words = 0
    chapter_counts = []
    
    for chap in CHAPTERS:
        chap_words = 0
        for item in chap.CONTENT:
            tag = item[0]
            if tag in ["p", "h1", "h2", "h3"]:
                chap_words += len(item[1].split())
            elif tag == "list":
                for bullet in item[1]:
                    chap_words += len(bullet.split())
            elif tag == "table":
                for header in item[1]:
                    chap_words += len(str(header).split())
                for row in item[2]:
                    for cell in row:
                        chap_words += len(str(cell).split())
                        
        chapter_counts.append((chap.title, chap_words))
        total_words += chap_words
        
    for title, count in chapter_counts:
        target = CHAPTER_TARGETS.get(title, 0)
        diff = count - target
        diff_str = f"{diff:+,}" if target > 0 else "N/A"
        print(f"  {title:<45} : {count:,} words (Target: {target:,}, Dev: {diff_str})")
        
    print("-"*50)
    print(f"  TOTAL SCIENTIFIC WORD COUNT           : {total_words:,} words")
    print("="*50)
    return total_words, chapter_counts

def run_figure_integrity_audit(chapters, figures_dir):
    """Verifies that all figures exist, are sequentially numbered, and referenced in text."""
    print("\n" + "="*50)
    print("RUNNING FIGURE INTEGRITY AUDIT")
    print("="*50)
    
    defined_figures = []
    for chap in chapters:
        for item in chap.CONTENT:
            if item[0] == "figure":
                fig_name, caption = item[1], item[2]
                match = re.search(r'Figure\s+([0-9A-Z\.]+)\b', caption)
                fig_num = match.group(1) if match else "Unknown"
                defined_figures.append((chap.chapter_number, fig_num, fig_name))
                
    missing_files = []
    for chap_num, fig_num, fig_name in defined_figures:
        fig_path = os.path.join(figures_dir, fig_name)
        if not os.path.exists(fig_path):
            missing_files.append((fig_num, fig_name))
            
    all_text = ""
    for chap in chapters:
        for item in chap.CONTENT:
            if item[0] in ["p", "h1", "h2", "h3"]:
                all_text += " " + item[1]
            elif item[0] == "list":
                all_text += " " + " ".join(item[1])
                
    unreferenced_figures = []
    for chap_num, fig_num, fig_name in defined_figures:
        ref_str = f"Figure {fig_num}"
        if ref_str not in all_text:
            unreferenced_figures.append(ref_str)
            
    by_chapter = {}
    for chap_num, fig_num, fig_name in defined_figures:
        if chap_num not in by_chapter:
            by_chapter[chap_num] = []
        minor_match = re.search(r'\.(\d+)$', fig_num)
        if minor_match:
            minor_num = int(minor_match.group(1))
            by_chapter[chap_num].append((minor_num, fig_num))
            
    gaps = []
    for chap_num, fig_list in by_chapter.items():
        fig_list.sort()
        expected = 1
        for minor, fig_num in fig_list:
            if minor != expected:
                gaps.append(f"Chapter {chap_num} figures: expected {chap_num}.{expected}, got {fig_num}")
                expected = minor + 1
            else:
                expected += 1
                
    print(f"  Total Figures Defined     : {len(defined_figures)}")
    print(f"  Missing Figure Files      : {len(missing_files)}")
    print(f"  Unreferenced Figures      : {len(unreferenced_figures)}")
    print(f"  Numbering Gaps Detected   : {len(gaps)}")
    
    if missing_files:
        for fig_num, fig_name in missing_files:
            print(f"    [ERROR] Missing file for Figure {fig_num}: {fig_name}")
    if unreferenced_figures:
        for ref in unreferenced_figures:
            print(f"    [WARNING] Figure is never referenced in text: {ref}")
    if gaps:
        for gap in gaps:
            print(f"    [ERROR] Numbering gap in {gap}")
            
    print("="*50)
    return len(missing_files), len(unreferenced_figures), len(gaps), len(defined_figures)

def run_citation_integrity_audit(chapters, citation_map):
    """Verifies citation mappings, checking for unused entries or numeric gaps."""
    print("\n" + "="*50)
    print("RUNNING CITATION INTEGRITY AUDIT")
    print("="*50)
    
    from thesis_compiler.chapters.references import REFERENCES
    
    missing_references = [key for key in citation_map if key not in REFERENCES]
    unused_references = [key for key in REFERENCES if key not in citation_map]
    
    citation_numbers = list(citation_map.values())
    if citation_numbers:
        expected_numbers = set(range(1, len(citation_map) + 1))
        actual_numbers = set(citation_numbers)
        gaps = expected_numbers - actual_numbers
    else:
        gaps = set()
        
    print(f"  Total Cited References   : {len(citation_map)}")
    print(f"  Unused Bibliography Keys : {len(unused_references)}")
    print(f"  Citation Key Gaps        : {len(gaps)}")
    
    if missing_references:
        for key in missing_references:
            print(f"    [ERROR] Cited key not defined in references.py: {key}")
    if gaps:
        print(f"    [ERROR] Gaps in citation sequence: {sorted(list(gaps))}")
        
    print("="*50)
    return len(missing_references), len(unused_references), len(gaps), len(citation_map)

def generate_freeze_report(report_path, word_count, refs_count, figs_count, tables_count, dups_removed, fig_errors, cite_errors):
    """Generates the final thesis_audit_report.txt file with freeze status."""
    print(f"\nWriting Thesis Freeze Report to {report_path}...")
    
    is_ready = (fig_errors == 0) and (cite_errors == 0) and (50000 <= word_count <= 70000)
    status_str = "READY FOR SUBMISSION" if is_ready else "REJECTED (Fix Errors first)"
    
    from thesis_compiler.chapters.preliminary import METADATA
    
    report_content = f"""============================================================
SUTRIX THESIS MANUSCRIPT FREEZE REPORT
============================================================
Title: {METADATA['title']}
Candidate: {METADATA['candidate']}
Degree: {METADATA['degree']}
Supervisor: {METADATA['supervisor']} ({METADATA['supervisor_designation']})
Institution: {METADATA['institution']}
University: {METADATA['university']}
Year: {METADATA['year']}

------------------------------------------------------------
AUDIT STATISTICS
------------------------------------------------------------
Word Count: {word_count:,} (Target: 60,000 +/- 10,000)
References: {refs_count}
Figures: {figs_count}
Tables: {tables_count}
Duplicate Paragraphs Removed: {dups_removed}

------------------------------------------------------------
INTEGRITY CHECK RESULTS
------------------------------------------------------------
Figure Errors (Missing/Gaps): {fig_errors}
Citation Errors (Missing/Gaps): {cite_errors}

------------------------------------------------------------
FINAL SUBMISSION STATUS
------------------------------------------------------------
STATUS: {status_str}
============================================================
"""
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_content)
    print(report_content)

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    figures_dir = os.path.join(base_dir, "figures")
    docx_output = os.path.join(base_dir, "thesis_manuscript.docx")
    pdf_output = os.path.join(base_dir, "thesis_manuscript.pdf")
    latex_output = os.path.join(base_dir, "latex")
    bib_file = os.path.join(base_dir, "bibliography", "references.bib")
    report_path = os.path.join(base_dir, "thesis_audit_report.txt")
    
    print("="*60)
    print("SUTRIX SCIENTIFIC DISSERTATION COMPILER PIPELINE")
    print("="*60)
    
    # ─── Stage 1: Generate Figures ──────────────────────────────────────────
    print("\n[STAGE 1] Running programmatical figure generation engine...")
    generate_figures()
    
    # ─── Stage 2: Compile Word Document ─────────────────────────────────────
    print("\n[STAGE 2] Compiling text modules to styled DOCX document...")
    build_docx(docx_output, figures_dir, CHAPTERS)
    
    # Import the statistics captured during DOCX pre-processing
    from thesis_compiler.docx_builder import DUPLICATES_REMOVED_COUNT, GLOBAL_CITATION_MAP
    
    # ─── Stage 3: Run Integrity Audits ──────────────────────────────────────
    print("\n[STAGE 3] Running dissertation integrity audits...")
    fig_missing, fig_unref, fig_gaps, fig_total = run_figure_integrity_audit(CHAPTERS, figures_dir)
    cite_missing, cite_unused, cite_gaps, cite_total = run_citation_integrity_audit(CHAPTERS, GLOBAL_CITATION_MAP)
    
    # Total count of tables in the manuscript
    tables_count = 0
    for chap in CHAPTERS:
        for item in chap.CONTENT:
            if item[0] == "table":
                tables_count += 1
                
    # ─── Stage 4: Export PDF via Microsoft Word COM ─────────────────────────
    print("\n[STAGE 4] Automating Microsoft Word to compile PDF output...")
    try:
        convert_docx_to_pdf(docx_output, pdf_output)
    except Exception as e:
        print(f"  [ERROR] Word-to-PDF compilation failed: {e}", file=sys.stderr)
        
    # ─── Stage 5: Export LaTeX Project ───────────────────────────────────────
    print("\n[STAGE 5] Exporting clean LaTeX source files and bibliography...")
    build_latex_project(latex_output, bib_file, figures_dir)
    
    # ─── Stage 6: Run Word Count Audit & Freeze Report ───────────────────────
    print("\n[STAGE 6] Finalizing word count and freeze reports...")
    words, chap_counts = calculate_word_count()
    
    fig_errors = fig_missing + fig_gaps
    cite_errors = cite_missing + cite_gaps
    
    generate_freeze_report(
        report_path, 
        words, 
        cite_total, 
        fig_total, 
        tables_count, 
        DUPLICATES_REMOVED_COUNT,
        fig_errors, 
        cite_errors
    )

if __name__ == "__main__":
    main()
