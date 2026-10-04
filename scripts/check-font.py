"""Dump cmap mappings for key Devanagari chars in Kalam font files."""
from fontTools.ttLib import TTFont
import sys

CHARS = {
    0x0928: 'न na',
    0x0935: 'व va',
    0x0938: 'स sa',
    0x0905: 'अ a',
    0x092A: 'प pa',
    0x091E: 'ञ nya',
    0x0928 + 0: 'न',
}
TEST = [0x0928, 0x0935, 0x0938, 0x0905, 0x092A, 0x0924, 0x091F, 0x093E, 0x0947]

for f in ['kalam-700-devanagari.woff2', 'kalam-700-latin.woff2', 'kalam-400-devanagari.woff2']:
    path = '/home/z/my-project/public/fonts/' + f
    font = TTFont(path)
    cmap = font.getBestCmap()
    print(f'=== {f} ===')
    print('  numGlyphs:', font['maxp'].numGlyphs)
    for cp in TEST:
        g = cmap.get(cp)
        print(f'  U+{cp:04X} {chr(cp)}: {g}')
    # check GSUB existence
    print('  has GSUB:', 'GSUB' in font)
    font.close()
