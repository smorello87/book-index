from flask import Flask, render_template, request, jsonify
import fitz  # PyMuPDF
import re
import os

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

def process_terms(terms_text, reverse_names=False):
    """Process terms from text input, handling parentheses and quotation marks.

    Args:
        terms_text: Text containing terms, one per line
        reverse_names: If True, reverse "Last, First" to search for "First Last"
    """
    raw_terms = [line.strip() for line in terms_text.split('\n') if line.strip()]

    terms_dict = {}
    for raw_term in raw_terms:
        # Strip quotation marks from the BEGINNING and END only (preserve apostrophes inside words)
        # Matches quotes at start/end: straight quotes, curly quotes, guillemets
        clean_term = re.sub(r'^[\u0022\u0027\u0060\u00B4\u2018\u2019\u201C\u201D\u201E\u201F\u2039\u203A\u00AB\u00BB]+|[\u0022\u0027\u0060\u00B4\u2018\u2019\u201C\u201D\u201E\u201F\u2039\u203A\u00AB\u00BB]+$', '', raw_term)

        # Extract terms inside parentheses
        terms_to_search = []
        matches = re.findall(r'\(([^)]+)\)', clean_term)  # Find content in parentheses
        for match in matches:
            # Split the content in parentheses by commas and strip whitespace
            terms_to_search.extend([term.strip() for term in match.split(',')])

        # Remove parentheses from the main term
        clean_term_no_parentheses = re.sub(r'\s*\(.*?\)\s*', '', clean_term).strip()

        # Handle name reversal: "Last, First" -> search for "First Last"
        if reverse_names and ',' in clean_term_no_parentheses:
            # Split by comma and reverse
            parts = [p.strip() for p in clean_term_no_parentheses.split(',', 1)]
            if len(parts) == 2:
                reversed_name = f"{parts[1]} {parts[0]}"
                terms_to_search.append(reversed_name)

        if clean_term_no_parentheses and not reverse_names:
            terms_to_search.append(clean_term_no_parentheses)

        # Remove duplicates and empty strings
        terms_to_search = [t for t in set(terms_to_search) if t]

        # Store with cleaned term as key (without quotes) for display
        display_term = clean_term_no_parentheses if not matches else clean_term
        terms_dict[display_term] = terms_to_search

    return terms_dict

def create_index_from_pdf(pdf_file, terms_text, names_text):
    """Create an index from a PDF file and list of terms."""
    # Process regular terms
    terms_dict = process_terms(terms_text, reverse_names=False)

    # Process names (with reversal)
    if names_text and names_text.strip():
        names_dict = process_terms(names_text, reverse_names=True)
        # Merge names into terms dict
        terms_dict.update(names_dict)

    # Open the PDF
    doc = fitz.open(stream=pdf_file.read(), filetype="pdf")

    # Dictionary to store the index
    index = {term: [] for term in terms_dict.keys()}

    # Iterate through the pages
    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text").lower()  # Convert text to lowercase for case-insensitive search

        # Normalize whitespace: replace line breaks and multiple spaces with single space
        # This allows matching across line breaks
        text = re.sub(r'\s+', ' ', text)

        # Check for occurrences of each term
        for original_term, term_variants in terms_dict.items():
            for variant in term_variants:
                # Use regular expression for word matching
                # Word boundary only before first alphanumeric char and after last alphanumeric char
                # This allows punctuation like "Help!" to match correctly
                escaped_variant = re.escape(variant.lower())
                # Match if preceded by word boundary or start, and followed by word boundary or end
                pattern = r'(?<![a-z0-9])' + escaped_variant + r'(?![a-z0-9])'
                if re.search(pattern, text):
                    if page_num + 1 not in index[original_term]:  # Avoid duplicate page numbers
                        index[original_term].append(page_num + 1)

    doc.close()

    # Format the index and identify not-found terms
    found_results = []
    not_found_terms = []

    for term, pages in index.items():
        if pages:  # Only include terms that appear in the document
            found_results.append((term, pages))
        else:
            not_found_terms.append(term)

    # Sort results alphabetically by term (case-insensitive)
    found_results.sort(key=lambda x: x[0].lower())

    # Format as strings
    formatted_results = [f"{term}: {', '.join(map(str, pages))}" for term, pages in found_results]

    return {
        'index': '\n'.join(formatted_results),
        'not_found': not_found_terms
    }

@app.route('/')
def index():
    """Render the main page."""
    return render_template('index.html')

@app.route('/generate-index', methods=['POST'])
def generate_index():
    """Handle PDF upload and generate index."""
    try:
        # Check if PDF file was uploaded
        if 'pdf' not in request.files:
            return jsonify({'error': 'No PDF file uploaded'}), 400

        pdf_file = request.files['pdf']
        if pdf_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Get terms and names
        terms_text = request.form.get('terms', '')
        names_text = request.form.get('names', '')

        # Check if at least one field has content
        if not terms_text.strip() and not names_text.strip():
            return jsonify({'error': 'No terms or names provided'}), 400

        # Generate the index
        result = create_index_from_pdf(pdf_file, terms_text, names_text)

        if not result['index'] and not result['not_found']:
            return jsonify({'error': 'No matching terms found in the PDF'}), 404

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': f'Error processing PDF: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', debug=True, port=5000, use_reloader=False)
