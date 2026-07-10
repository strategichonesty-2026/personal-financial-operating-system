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

print(json.dumps(items))
