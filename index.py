import fitz  # PyMuPDF
import re

def create_pdf_index(pdf_path, terms_file, output_file):
    # Load terms from the text file
    with open(terms_file, 'r') as f:
        raw_terms = [line.strip() for line in f if line.strip()]
    
    # Preprocess terms to handle parentheses and quotation marks
    terms_dict = {}
    for raw_term in raw_terms:
        # Remove quotation marks
        clean_term = raw_term.replace('"', '').replace("'", "")
        
        # Extract terms inside parentheses
        terms_to_search = [clean_term]  # Start with the full term
        matches = re.findall(r'\(([^)]+)\)', clean_term)  # Find content in parentheses
        for match in matches:
            # Split the content in parentheses by commas and strip whitespace
            terms_to_search.extend([term.strip() for term in match.split(',')])
        
        # Remove parentheses from the main term
        clean_term_no_parentheses = re.sub(r'\s*\(.*?\)\s*', '', clean_term).strip()
        if clean_term_no_parentheses not in terms_to_search:
            terms_to_search.append(clean_term_no_parentheses)
        
        terms_dict[raw_term] = set(terms_to_search)  # Use a set to ensure unique terms
    
    # Open the PDF
    doc = fitz.open(pdf_path)
    
    # Dictionary to store the index
    index = {term: [] for term in terms_dict.keys()}
    
    # Iterate through the pages
    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text").lower()  # Convert text to lowercase for case-insensitive search
        
        # Check for occurrences of each term
        for original_term, term_variants in terms_dict.items():
            for variant in term_variants:
                # Use regular expression for whole-word matching
                pattern = r'\b' + re.escape(variant.lower()) + r'\b'
                if re.search(pattern, text):  # Match whole words only
                    if page_num + 1 not in index[original_term]:  # Avoid duplicate page numbers
                        index[original_term].append(page_num + 1)
    
    # Write the index to an output file
    with open(output_file, 'w') as f:
        for term, pages in index.items():
            if pages:  # Only include terms that appear in the document
                f.write(f"{term}: {', '.join(map(str, pages))}\n")
    
    print(f"Index created and saved to {output_file}")

# Example usage
pdf_path = "9798765128619_txt_prf.pdf"
terms_file = "terms.txt"  # Input file containing terms/expressions (one per line)
output_file = "index.txt"  # Output index file

create_pdf_index(pdf_path, terms_file, output_file)
