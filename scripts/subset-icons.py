#!/usr/bin/env python3
"""
Génère public/fonts/material-symbols-outlined.woff2 : un sous-ensemble de la police
Material Symbols ne contenant QUE les icônes utilisées par le site (~18 Ko au lieu de 290 Ko).

À relancer après avoir ajouté une nouvelle icône dans le code :
    pip install fonttools brotli
    python3 scripts/subset-icons.py

Le script scanne les .html / src/*.ts / src/*.css, garde tous les mots qui correspondent
à un nom d'icône, puis appelle pyftsubset en conservant les ligatures (feature 'rlig').
"""
import glob, os, re, subprocess, sys
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'scripts/fonts-src/material-symbols-outlined.full.woff2')
OUT = os.path.join(ROOT, 'public/fonts/material-symbols-outlined.woff2')

font = TTFont(SRC)
rev = {gid: chr(cp) for cp, gid in font.getBestCmap().items()}
ligatures = {}
for lookup in font['GSUB'].table.LookupList.Lookup:
    for sub in lookup.SubTable:
        sub = getattr(sub, 'ExtSubTable', sub)
        for first, ligs in getattr(sub, 'ligatures', {}).items():
            for lig in ligs:
                try:
                    ligatures[''.join(rev[g] for g in [first] + lig.Component)] = lig.LigGlyph
                except KeyError:
                    pass

files = [f for pattern in ('*.html', 'src/*.ts', 'src/*.css')
         for f in glob.glob(os.path.join(ROOT, pattern)) if 'sagas_data' not in f]
words = set()
for f in files:
    with open(f, encoding='utf-8') as fh:
        words |= set(re.findall(r'[a-z][a-z0-9_]*', fh.read()))
used = sorted(w for w in words if w in ligatures)
print(f'{len(used)} icônes conservées')

subprocess.run([
    sys.executable, '-m', 'fontTools.subset', SRC,
    '--glyphs=' + ','.join(sorted({ligatures[w] for w in used})),
    '--text=abcdefghijklmnopqrstuvwxyz0123456789_ ',
    '--layout-features=*', '--no-layout-closure',
    '--flavor=woff2', '--output-file=' + OUT,
], check=True)
print(f'{OUT} : {os.path.getsize(OUT) // 1024} Ko')
