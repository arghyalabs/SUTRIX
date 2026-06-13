"""
SUTRIX Thesis PDF Builder
Uses Microsoft Word COM Automation to compile the DOCX into a publication-grade PDF.
Automatically updates the dynamic Table of Contents, headers, and footers before export.
"""

import os
import sys
import win32com.client

def convert_docx_to_pdf(docx_path, pdf_path):
    # Ensure absolute paths (required by COM automation)
    abs_docx_path = os.path.abspath(docx_path)
    abs_pdf_path = os.path.abspath(pdf_path)
    
    if not os.path.exists(abs_docx_path):
        raise FileNotFoundError(f"Source DOCX file not found: {abs_docx_path}")
        
    print(f"Opening Microsoft Word COM Application Server...")
    # Initialize Word Application (non-visible, headless)
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0 # wdAlertsNone = 0 (prevents dialog prompt popups)
    
    try:
        print(f"Opening Document: {abs_docx_path}")
        doc = word.Documents.Open(abs_docx_path)
        
        # ─── Update Dynamic Fields (TOC & Page Numbers) ────────────────────────
        print("Updating Table of Contents, List of Figures/Tables, and headers/footers...")
        doc.Fields.Update()
        
        # Update fields in headers/footers of all sections
        for section in doc.Sections:
            for header in section.Headers:
                header.Range.Fields.Update()
            for footer in section.Footers:
                footer.Range.Fields.Update()
                
        # ─── Save as PDF ──────────────────────────────────────────────────────
        # wdFormatPDF = 17
        print(f"Saving PDF to: {abs_pdf_path}...")
        doc.SaveAs(abs_pdf_path, FileFormat=17)
        
        doc.Close(SaveChanges=0) # wdDoNotSaveChanges = 0
        print("PDF Export successfully finished!")
    except Exception as e:
        print(f"Fatal error during Word COM compilation: {str(e)}", file=sys.stderr)
        raise e
    finally:
        word.Quit()
        print("Microsoft Word Application closed.")

if __name__ == "__main__":
    docx_file = os.path.join(os.path.dirname(__file__), "thesis_manuscript.docx")
    pdf_file = os.path.join(os.path.dirname(__file__), "thesis_manuscript.pdf")
    
    if os.path.exists(docx_file):
        convert_docx_to_pdf(docx_file, pdf_file)
    else:
        print(f"Error: {docx_file} does not exist. Run docx_builder.py first.")
