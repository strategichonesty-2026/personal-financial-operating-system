#!/usr/bin/env python3
import sys, json
from pdfminer.high_level import extract_pages
from pdfminer.layout import LAParams, LTTextBox

pdf_path = sys.argv[1]
items = []

for page_num, page_layout in enumerate(extract_pages(pdf_path, laparams=LAParams(line_margin=0.1)), 1):
    for el in page_layout:
        if isinstance(el, LTTextBox):
            text = el.get_text().strip()
            if text and el.x0 >= 55 and (el.x1 - el.x0) < 400:
                items.append({
                    'x': round(el.x0, 1),
                    'y': round(el.y0, 1),
                    'text': text,
                    'page': page_num
                })

import re

def redact(text):
    # Routing number — fully redact
    text = re.sub(r'(Routing Number \(RTN\)[:\s]+)(\d+)', r'\1****', text, flags=re.IGNORECASE)
    # Long account numbers (8+ digits) — keep last 4
    text = re.sub(r'\b\d{5,}(\d{4})\b', r'****\1', text)
    # Short 4-digit account refs near "account" keyword
    text = re.sub(r'(account number[^\d]*)(\d{4})', r'\1****', text, flags=re.IGNORECASE)
    # "XXXX ending in NNNN" patterns
    text = re.sub(r'(ending in[:\s]+)(\d{4})', r'\1****', text, flags=re.IGNORECASE)
    # Standalone 4-digit account refs like "4184  (primary account)"
    text = re.sub(r'\b(\d{4})\s+(\(primary account\))', r'****  \2', text, flags=re.IGNORECASE)
    # "Savings - NNNNNNNNNNNN" style
    text = re.sub(r'(Savings\s+-\s+)(\d+)', r'\1****', text, flags=re.IGNORECASE)
    return text

for item in items:
    item['text'] = redact(item['text'])

print(json.dumps(items))
