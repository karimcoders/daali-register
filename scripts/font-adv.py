"""Compute advance widths of key glyphs in Kalam 700 Devanagari."""
from fontTools.ttLib import TTFont

font = TTFont('/home/z/my-project/public/fonts/kalam-700-devanagari.woff2')
hmtx = font['hmtx']
cmap = font.getBestCmap()
upm = font['head'].unitsPerEm
print('unitsPerEm:', upm)
for name in ['न', 'व', 'स', 'अ', 'प', 'त', 'ा', 'े']:
    g = cmap.get(ord(name))
    adv, lsb = hmtx[g]
    print(f'{name} U+{ord(name):04X} glyph={g} advance={adv} ({adv/upm:.4f}em)')
font.close()
