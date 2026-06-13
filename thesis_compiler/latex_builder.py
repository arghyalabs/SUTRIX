"""
SUTRIX Thesis LaTeX Builder
Translates the modular Python chapters into compile-ready LaTeX source code.
Creates a self-contained LaTeX project directory structure with figures and bibliography.
Integrates unsrt bibliography style for Vancouver ordering and duplicate filtering.
"""

import os
import re
import shutil
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Import metadata and chapter list
from thesis_compiler.chapters.preliminary import METADATA
from thesis_compiler.chapters import CHAPTERS

def escape_latex(text):
    """Escapes special LaTeX characters and replaces markdown citations with \\cite."""
    if not isinstance(text, str):
        return str(text)
        
    # Translate citations [citation_key] -> \cite{citation_key} or [key1, key2] -> \cite{key1,key2}
    text = re.sub(r'\[([a-zA-Z0-9_, ]+)\]', lambda m: '\\cite{' + m.group(1).replace(' ', '') + '}', text)
    
    # Escape standard special characters
    special_chars = {
        '&': '\\&',
        '_': '\\_',
        '#': '\\#',
        '%': '\\%',
        '$': '\\$',
        '{': '\\{',
        '}': '\\}',
        '^': '\\textsuperscript{^}',
        '~': '\\textsubscript{~}',
    }
    
    for char, rep in special_chars.items():
        text = re.sub(r'(?<!\\)' + re.escape(char), rep, text)
        
    return text

def preprocess_latex_chapter_content(content, threshold=0.85):
    """Filters out duplicate paragraphs from a chapter's content list using semantic check."""
    preprocessed_content = []
    chapter_text_history = []
    
    for item in content:
        tag = item[0]
        if tag == "p":
            val = item[1]
            words = val.split()
            if len(words) >= 10:
                # 1. Exact duplicate removal
                normalized_p = re.sub(r'\s+', ' ', val).strip()
                p_hash = hash(normalized_p)
                is_exact_dup = False
                for prev_p in chapter_text_history:
                    if hash(re.sub(r'\s+', ' ', prev_p).strip()) == p_hash:
                        is_exact_dup = True
                        break
                if is_exact_dup:
                    continue
                    
                # 2. Semantic check
                if chapter_text_history:
                    try:
                        vectorizer = TfidfVectorizer(analyzer='char_wb', ngram_range=(3, 5)).fit_transform(chapter_text_history + [val])
                        vectors = vectorizer.toarray()
                        p_vector = vectors[-1].reshape(1, -1)
                        prev_vectors = vectors[:-1]
                        similarities = cosine_similarity(p_vector, prev_vectors)[0]
                        if max(similarities) > threshold:
                            continue # Discard duplicate
                    except Exception:
                        pass
                chapter_text_history.append(val)
            preprocessed_content.append(item)
        else:
            preprocessed_content.append(item)
            
    return preprocessed_content

def compile_latex_chapter(chap, output_dir):
    filename = f"chapter_{chap.chapter_number.lower()}.tex"
    filepath = os.path.join(output_dir, filename)
    print(f"  Exporting LaTeX chapter to: {filename}...")
    
    # Deduplicate chapter content prior to writing
    filtered_content = preprocess_latex_chapter_content(chap.CONTENT, threshold=0.85)
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"% Chapter {chap.chapter_number}: {chap.title}\n")
        f.write(f"% Generated automatically by SUTRIX Compiler\n\n")
        
        for item in filtered_content:
            tag = item[0]
            if tag == "h1":
                title_clean = escape_latex(item[1].replace("Chapter " + chap.chapter_number + ": ", ""))
                f.write(f"\\chapter{{{title_clean}}}\n\n")
            elif tag == "h2":
                sec_text = re.sub(r'^[0-9A-Z\.]+\s+', '', item[1])
                f.write(f"\\section{{{escape_latex(sec_text)}}}\n\n")
            elif tag == "h3":
                sec_text = re.sub(r'^[0-9A-Z\.]+\s+', '', item[1])
                f.write(f"\\subsection{{{escape_latex(sec_text)}}}\n\n")
            elif tag == "p":
                f.write(f"{escape_latex(item[1])}\n\n")
            elif tag == "equation":
                f.write("\\begin{equation}\n")
                f.write(f"{item[1]}\n")
                f.write("\\end{equation}\n\n")
            elif tag == "list":
                f.write("\\begin{itemize}\n")
                for bullet in item[1]:
                    f.write(f"  \\item {escape_latex(bullet)}\n")
                f.write("\\end{itemize}\n\n")
            elif tag == "figure":
                fig_name, caption = item[1], item[2]
                fig_label = os.path.splitext(fig_name)[0]
                f.write("\\begin{figure}[htbp]\n")
                f.write("  \\centering\n")
                f.write(f"  \\includegraphics[width=0.9\\textwidth]{{figures/{fig_name}}}\n")
                f.write(f"  \\caption{{{escape_latex(caption)}}}\n")
                f.write(f"  \\label{{fig:{fig_label}}}\n")
                f.write("\\end{figure}\n\n")
            elif tag == "table":
                headers, rows, caption = item[1], item[2], item[3]
                cols_format = "l" * len(headers)
                
                f.write("\\begin{table}[htbp]\n")
                f.write("  \\centering\n")
                f.write(f"  \\caption{{{escape_latex(caption)}}}\n")
                f.write(f"  \\label{{tab:table_{chap.chapter_number.lower()}_{rows[0][0][:4].lower() if rows else 'data'}}}\n")
                f.write(f"  \\begin{{tabular}}{{{cols_format}}}\n")
                f.write("    \\toprule\n")
                
                # Headers
                hdr_str = " & ".join([escape_latex(h) for h in headers])
                f.write(f"    {hdr_str} \\\\\n")
                f.write("    \\midrule\n")
                
                # Rows
                for row in rows:
                    row_str = " & ".join([escape_latex(str(val)) for val in row])
                    f.write(f"    {row_str} \\\\\n")
                    
                f.write("    \\bottomrule\n")
                f.write("  \\end{tabular}\n")
                f.write("\\end{table}\n\n")
            elif tag == "code":
                code_text, caption = item[1], item[2]
                f.write("\\begin{lstlisting}[language=python, caption={" + escape_latex(caption) + "}]\n")
                f.write(f"{code_text}\n")
                f.write("\\end{lstlisting}\n\n")
            elif tag == "page_break":
                f.write("\\clearpage\n\n")

def build_latex_project(latex_root, src_bib_path, figures_src_dir):
    print(f"Initializing LaTeX Source Compiler in: {latex_root}...")
    chapters_dir = os.path.join(latex_root, "chapters")
    figures_dest_dir = os.path.join(latex_root, "figures")
    
    os.makedirs(chapters_dir, exist_ok=True)
    os.makedirs(figures_dest_dir, exist_ok=True)
    
    # ─── Copy Figures and Bibliography ────────────────────────────────────────
    print("Copying project assets...")
    if os.path.exists(src_bib_path):
        shutil.copy(src_bib_path, os.path.join(latex_root, "references.bib"))
    else:
        print(f"  [WARNING] references.bib not found at {src_bib_path}")
        
    if os.path.exists(figures_src_dir):
        for filename in os.listdir(figures_src_dir):
            if filename.endswith(".png"):
                shutil.copy(
                    os.path.join(figures_src_dir, filename),
                    os.path.join(figures_dest_dir, filename)
                )
    else:
        print(f"  [WARNING] Figures source dir not found at {figures_src_dir}")
        
    # ─── Compile Main thesis.tex File ─────────────────────────────────────────
    master_path = os.path.join(latex_root, "thesis.tex")
    print(f"Creating main master document: thesis.tex...")
    
    with open(master_path, "w", encoding="utf-8") as f:
        f.write(r"""\documentclass[12pt,a4paper,oneside]{book}

% --- Core System Packages ---
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{amsmath,amsfonts,amssymb}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage{geometry}
\usepackage{setspace}
\usepackage{listings}
\usepackage{xcolor}
\usepackage{hyperref}
\usepackage{cite}

% --- Custom Page Geometry ---
\geometry{
    top=1in,
    bottom=1in,
    left=1in,
    right=1in
}

% --- Line Spacing ---
\onehalfspacing

% --- Colors ---
\definecolor{navyblue}{RGB}{27, 54, 93}
\definecolor{codegray}{RGB}{241, 245, 249}

\hypersetup{
    colorlinks=true,
    linkcolor=navyblue,
    citecolor=navyblue,
    urlcolor=navyblue
}

% --- Code Block Formatting ---
\lstset{
    backgroundcolor=\color{codegray},
    basicstyle=\ttfamily\footnotesize,
    breakatwhitespace=false,
    breaklines=true,
    captionpos=b,
    commentstyle=\color{gray},
    keywordstyle=\color{navyblue},
    showspaces=false,
    showstringspaces=false,
    showtabs=false,
    frame=single,
    rulecolor=\color{navyblue}
}

% --- Document Metadata ---
\title{""" + METADATA['title'] + r"""}
\author{""" + METADATA['candidate'] + r"""}
\date{2026}

\begin{document}

% ==============================================================================
% FRONT MATTER
% ==============================================================================
\frontmatter

% Custom Cover Page
\begin{titlepage}
    \centering
    \vspace*{2cm}
    {\LARGE\bfseries\color{navyblue} """ + METADATA['title'] + r""" \par}
    \vspace{2cm}
    {\large A dissertation manuscript submitted in partial fulfillment of the requirements for the degree of \par}
    {\large\itshape """ + METADATA['degree'] + r""" \par}
    \vspace{2.5cm}
    {\large Submitted by \par}
    {\large\bfseries """ + METADATA['candidate'] + r""" \par}
    \vspace{2cm}
    {\large Under the Supervision of \par}
    {\large\bfseries """ + METADATA['supervisor'] + r""" \par}
    {\large\itshape """ + METADATA['supervisor_designation'] + r""" \par}
    \vspace{3cm}
    {\large """ + METADATA['department'] + r""" \par}
    {\large\bfseries """ + METADATA['institution'] + r""" \par}
    {\large Academic Year: """ + METADATA['year'] + r""" \par}
\end{titlepage}

\clearpage

% Table of Contents and Lists
\tableofcontents
\listoffigures
\listoftables

% ==============================================================================
% MAIN MATTER
% ==============================================================================
\mainmatter
""")
        
        # Include Chapter .tex files
        for chap in CHAPTERS:
            compile_latex_chapter(chap, chapters_dir)
            f.write(f"\\include{{chapters/chapter_{chap.chapter_number.lower()}}}\n")
            
        f.write(r"""
% ==============================================================================
% BACK MATTER (Bibliography)
% ==============================================================================
\backmatter
\bibliographystyle{unsrt}
\bibliography{references}

\end{document}
""")
    print("LaTeX Project compilation completed successfully!")

if __name__ == "__main__":
    latex_path = os.path.join(os.path.dirname(__file__), "latex")
    bib_file = os.path.join(os.path.dirname(__file__), "bibliography", "references.bib")
    figures_src = os.path.join(os.path.dirname(__file__), "figures")
    build_latex_project(latex_path, bib_file, figures_src)
