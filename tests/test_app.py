"""Tests for the Flask version. Run: python -m unittest discover tests"""
import io
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from app import app, build_index, create_index_from_pdf  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(__file__), 'fixtures', 'sample.pdf')


def pages(*texts):
    return [(str(i + 1), t) for i, t in enumerate(texts)]


class MatchingTests(unittest.TestCase):
    def test_typographic_text(self):
        r = build_index(pages('You’re the intel-\nligence of a well-\nknown ﬁnancial firm'),
                        "You're\nintelligence\nwell-known\nfinancial")
        self.assertEqual(r['not_found'], [])

    def test_names_and_boundaries(self):
        r = build_index(pages('George W. Bush, Madonna and Barack Obama2 were helping in 19845.'),
                        'help\n1984', 'Bush, George W.\nMadonna\nObama, Barack')
        self.assertEqual(r['index'], 'Bush, George W.: 1\nMadonna: 1\nObama, Barack: 1')
        self.assertEqual(r['not_found'], ['help', '1984'])

    def test_fixture_matches_js_version(self):
        with open(FIXTURE, 'rb') as f:
            r = create_index_from_pdf(
                f,
                "You're\nintelligence\nfinancial\nMüller\nFrançois\nHelp!\nartificial intelligence (AI)\nhelp\n1984\nContents",
                'Bush, George W.\nMadonna\nObama, Barack')
        self.assertEqual(r['index'].split('\n'), [
            '1984: 4', 'artificial intelligence (AI): 4', 'Bush, George W.: 2', 'Contents: ii',
            'financial: 3', 'François: 2', 'help: 4', 'Help!: 4', 'intelligence: 1, 4', 'Madonna: 2',
            'Müller: 2', 'Obama, Barack: 3', "You're: 1"])


class EndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_too_large_returns_413_json(self):
        big = io.BytesIO(b'%PDF' + b'0' * (51 * 1024 * 1024))
        resp = self.client.post('/generate-index', data={'pdf': (big, 'x.pdf'), 'terms': 'a'},
                                content_type='multipart/form-data')
        self.assertEqual(resp.status_code, 413)
        self.assertIn('50MB', resp.get_json()['error'])

    def test_invalid_pdf_returns_friendly_error(self):
        resp = self.client.post('/generate-index', data={'pdf': (io.BytesIO(b'not a pdf'), 'x.pdf'), 'terms': 'a'},
                                content_type='multipart/form-data')
        self.assertEqual(resp.status_code, 500)
        self.assertNotIn('Traceback', resp.get_json()['error'])


class ParityTests(unittest.TestCase):
    def test_suffix_names_and_sorting_match_js(self):
        r = build_index(pages('Martin Luther King Jr. spoke', 'as Martin Luther King, Jr. wrote',
                              '#MeToo Łódź Ørsted Lagos Oslo Mars zebra'),
                        '#MeToo\nŁódź\nØrsted\nLagos\nOslo\nMars\nzebra', 'King, Martin Luther, Jr.')
        self.assertEqual([line.split(':')[0] for line in r['index'].split('\n')],
                         ['King, Martin Luther, Jr.', 'Lagos', 'Łódź', 'Mars', '#MeToo', 'Ørsted', 'Oslo', 'zebra'])


if __name__ == '__main__':
    unittest.main()
