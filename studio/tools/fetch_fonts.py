#!/usr/bin/env python3
"""Google Fonts → yerel woff2 (çevrimdışı çalışsın diye). Çıktı: web/fonts/*.woff2 ve web/css/fonts.css"""
import os, re, sys, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, '..', 'web')
FAMILIES = [
    'Oswald:wght@400;700', 'Chakra+Petch:ital,wght@0,400;0,700;1,400;1,700', 'Montserrat:ital,wght@0,400;0,800;1,400;1,800',
    'Bebas+Neue', 'Anton', 'Russo+One', 'Orbitron:wght@400;800', 'Teko:wght@400;700', 'Black+Ops+One', 'Racing+Sans+One',
    'Bangers', 'Permanent+Marker', 'Dancing+Script:wght@400;700', 'Pacifico', 'Roboto+Condensed:ital,wght@0,400;0,700;1,400;1,700',
    'JetBrains+Mono:wght@400;700',
]
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
KEEP = {'latin', 'latin-ext'}

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    return urllib.request.urlopen(req, timeout=60).read()

os.makedirs(os.path.join(WEB, 'fonts'), exist_ok=True)
css_out = ['/* fetch_fonts.py ile üretildi */']
for fam in FAMILIES:
    css = get('https://fonts.googleapis.com/css2?family=' + fam + '&display=swap').decode('utf-8')
    for m in re.finditer(r'/\* ([a-z\-]+) \*/\s*@font-face\s*\{(.*?)\}', css, re.S):
        subset, body = m.group(1), m.group(2)
        if subset not in KEEP:
            continue
        url = re.search(r'url\((https://[^)]+\.woff2)\)', body).group(1)
        fn = re.sub(r'[^a-z0-9]+', '-', (re.search(r"font-family:\s*'([^']+)'", body).group(1) + '-' +
              re.search(r'font-style:\s*(\w+)', body).group(1) + '-' + re.search(r'font-weight:\s*([\d ]+)', body).group(1).strip() + '-' + subset).lower()) + '.woff2'
        path = os.path.join(WEB, 'fonts', fn)
        if not os.path.isfile(path):
            open(path, 'wb').write(get(url))
        css_out.append('@font-face {' + re.sub(r'src:[^;]+;', "src: url('../fonts/" + fn + "') format('woff2');", body).replace('\n', ' ') + '}')
    print('ok', fam)
open(os.path.join(WEB, 'css', 'fonts.css'), 'w', encoding='utf-8').write('\n'.join(css_out) + '\n')
print('toplam', len(css_out) - 1, 'yüz')
