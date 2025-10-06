# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Flask web application for generating book indexes from PDF files. Authors can upload PDFs and enter search terms via a web interface to generate a professionally formatted index ready to copy-paste into their books.

## Core Architecture

### Backend (`app.py`)
Flask application with two main endpoints:
- **`/`**: Serves the main HTML interface
- **`/generate-index` (POST)**: Handles PDF uploads, processes terms/names, and returns index with not-found terms

Core functions:
- **`process_terms(terms_text, reverse_names=False)`**: Preprocesses term variations with special handling:
  - Strips all quotation marks (straight, curly, guillemets) from beginning/end only (preserves internal apostrophes)
  - Extracts parenthetical variants: `term (variant1, variant2)` searches for all variants
  - If `reverse_names=True`, reverses "Last, First" to search for "First Last" in PDF
- **`create_index_from_pdf(pdf_file, terms_text, names_text)`**: Main processing function:
  - Normalizes whitespace in PDF text (handles line breaks within terms)
  - Uses lookahead/lookbehind regex for word boundaries (handles punctuation like "Help!")
  - Merges terms and names dictionaries
  - Alphabetically sorts results (case-insensitive)
  - Returns both found terms and not-found terms

### Search Pattern Logic
- Pattern: `(?<![a-z0-9])TERM(?![a-z0-9])` allows matching with punctuation
- Normalizes PDF text whitespace with `re.sub(r'\s+', ' ', text)` to match across line breaks
- Case-insensitive matching throughout

### Name Reversal Feature
Separate input field for names in index format:
- Input: "Bush, George W."
- Searches PDF for: "George W. Bush"
- Displays in results as: "Bush, George W.: 5, 12, 28"
- Merged and sorted alphabetically with regular terms

### Frontend
- **`templates/index.html`**:
  - Two textareas: one for regular terms, one for names
  - Warning notices about PDF page numbering and Works Cited sections
  - Displays not-found terms in yellow warning box
  - Copy-to-clipboard functionality
- **`static/style.css`**: Gradient purple theme, responsive design, notice boxes

### Legacy Script
`index.py` contains the original command-line version (still functional but superseded by web app)

## Dependencies

Install via `pip install -r requirements.txt`:
- **Flask**: Web framework
- **PyMuPDF (fitz)**: PDF parsing and text extraction
- **Werkzeug**: File upload handling

## Running the Application

```bash
# Install dependencies
pip install -r requirements.txt

# Run the Flask development server
python app.py
```

The application will be available at `http://127.0.0.1:5000`

**Note:** Uses `use_reloader=False` to avoid watchdog dependency issues.

## Input Format

**Regular Terms:**
- One per line
- Use parentheses for variants: `artificial intelligence (AI, machine learning)`
- Quotation marks are automatically stripped from beginning/end
- Apostrophes inside words are preserved

**Names:**
- Format: "Last, First Middle"
- Script reverses to search for "First Middle Last" in PDF
- Results display in original "Last, First Middle" format

## Output Format

Results are alphabetically sorted and formatted as:
```
Bush, George W.: 5, 12, 28
Clinton, Hillary: 3, 45
neural networks: 10, 15, 30
term with punctuation!: 7, 22
```

Not-found terms are displayed in a separate warning box.

## Important Notes

- PDF text extraction preserves line breaks - the app handles this by normalizing whitespace
- Word boundaries use negative lookahead/lookbehind to handle punctuation
- All Unicode quotation marks are stripped (straight, curly, guillemets, etc.)
- Results are case-insensitive for searching but preserve original capitalization in display
