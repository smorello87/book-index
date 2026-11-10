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

# Password-protected fixture for the error-path test.
locked = pymupdf.open()
locked.new_page().insert_text((72, 72), 'secret', fontname='helv')
locked_out = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'locked.pdf')
locked.save(locked_out, encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw='pw', owner_pw='owner')
print('wrote', os.path.normpath(locked_out))
