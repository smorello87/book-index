"""Regenerate tests/fixtures/sample.pdf (needs PyMuPDF): python scripts/make_fixture.py"""
import os
import pymupdf

FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
PAGES = [
    'Title Page',                                            # label i
    'Contents',                                              # label ii
    'You’re reading about the intel-\nligence report and a well-\nknown fact.',  # 1
    'François Müller met George W. Bush and Madonna.',                        # 2
    'The ﬁnancial crisis. Barack Obama2 spoke. They were helping.',                # 3
    'Help! said the narrator. Artificial intelligence (AI) is here. In 1984 and 19845.',  # 4
]

doc = pymupdf.open()
for text in PAGES:
    page = doc.new_page()
    page.insert_font(fontname='arial', fontfile=FONT)
    page.insert_text((72, 72), text, fontname='arial', fontsize=11)
doc.set_page_labels([
    {'startpage': 0, 'prefix': '', 'style': 'r', 'firstpagenum': 1},
    {'startpage': 2, 'prefix': '', 'style': 'D', 'firstpagenum': 1},
])
out = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'sample.pdf')
doc.save(out, garbage=4, deflate=True)
print('wrote', os.path.normpath(out))
