# Book Index Generator

A Flask web application that automatically generates professional book indexes from PDF files. Authors can upload their PDFs and input search terms to create a formatted index ready to copy-paste into their books.

**[Live Demo →](https://veritas44.pythonanywhere.com/)**

## Features

- **PDF Processing**: Upload PDFs and extract term locations page-by-page
- **Smart Term Matching**:
  - Handles quotation marks (automatically stripped from search)
  - Supports term variants with parentheses: `artificial intelligence (AI, machine learning)`
  - Matches across line breaks in PDF text
  - Handles punctuation (e.g., "Help!" will be found correctly)
- **Name Reversal**: Separate input for names in index format
  - Input: "Bush, George W." → Searches for: "George W. Bush" → Displays: "Bush, George W.: 5, 12, 28"
- **Alphabetical Sorting**: All results automatically sorted case-insensitively
- **Not Found Tracking**: Shows which terms were not found in the PDF
- **Copy-to-Clipboard**: One-click copy of the generated index

## How It Works

1. **Upload**: Select a PDF file (max 50MB)
2. **Enter Terms**:
   - Regular terms in the "Terms" field (one per line)
   - Names in "Last, First" format in the "Names" field
3. **Generate**: Click "Generate Index"
4. **Copy**: Results are formatted and ready to paste into your book

### Input Format Examples

**Regular Terms:**
```
artificial intelligence (AI, machine learning)
neural networks
"deep learning"
climate change
```

**Names:**
```
Bush, George W.
Obama, Barack
Clinton, Hillary
```

### Output Format

```
Bush, George W.: 5, 12, 28
climate change: 10, 15, 30, 42
Clinton, Hillary: 3, 45
neural networks: 7, 22, 35
Obama, Barack: 18, 29
```

## Important Notes

- **Page Numbering**: Remove all pages before page 1 of your book content (title page, copyright, table of contents, etc.) or the page numbers will be incorrect
- **Works Cited**: Manually review results to remove any matches from bibliography/references sections
- **Quotation Marks**: All types of quotation marks (straight, curly, smart quotes) are automatically stripped from the beginning and end of terms, but apostrophes within words are preserved
- **Privacy**: Uploaded PDFs are processed entirely in memory and are never saved to disk. Zero retention policy - your files are not stored or accessible to the developer

## Running Locally

### Prerequisites
- Python 3.8+
- pip

### Installation

1. Clone the repository:
```bash
git clone https://github.com/smorello87/book-index.git
cd book-index
```

2. Create a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the application:
```bash
python app.py
```

5. Open your browser to:
```
http://127.0.0.1:5000
```

## Deploying to Production

### PythonAnywhere (Free Tier)

1. Create account at [pythonanywhere.com](https://www.pythonanywhere.com)
2. Upload files or clone from GitHub
3. Create virtual environment:
```bash
mkvirtualenv --python=/usr/bin/python3.10 book-index-venv
pip install -r requirements.txt
```
4. Configure web app in the Web tab (see PythonAnywhere docs)
5. Set WSGI file and virtualenv path
6. Reload the app

### Other Platforms

The app can be deployed to any platform that supports Flask:
- **Render**: Connect GitHub repo for auto-deploy
- **Railway**: Free tier with GitHub integration
- **Heroku**: Add `Procfile` with `web: gunicorn app:app`
- **DigitalOcean/Linode**: Use Gunicorn + Nginx

## Technical Details

### Architecture
- **Backend**: Flask (Python)
- **PDF Processing**: PyMuPDF (fitz)
- **Search Pattern**: Regex with negative lookahead/lookbehind for word boundaries
- **Text Normalization**: Whitespace collapsed to handle line breaks
- **Frontend**: Vanilla JavaScript, responsive CSS

### Key Functions
- `process_terms(terms_text, reverse_names=False)`: Preprocesses terms and handles name reversal
- `create_index_from_pdf(pdf_file, terms_text, names_text)`: Main processing function that searches PDF and returns sorted results

## Dependencies

- Flask 3.0.0
- PyMuPDF 1.23.8
- Werkzeug 3.0.1

## License

GNU General Public License v3.0

## Author

Developed by [Stefano Morello](https://stefanomorello.com)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Links

- **Live Demo**: https://veritas44.pythonanywhere.com/
- **GitHub Repository**: https://github.com/smorello87/book-index
- **Author Website**: https://stefanomorello.com
