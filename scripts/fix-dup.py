#!/usr/bin/env python3
# Remove duplicate rachna key from dict.ts (line containing 'rashmi' + 'rachna')
import io, re

P = '/home/z/my-project/src/lib/daali/dict.ts'
s = io.open(P, encoding='utf-8').read()
lines = s.split('\n')
out = []
seen_rachna = False
for ln in lines:
    if 'rachna:' in ln and 'rashmi:' in ln:
        # strip the rachna entry from this line (keep rashmi + satto)
        # rachna entry looks like: rachna: ['...', '...'],
        ln2 = re.sub(r"\s*rachna: \[[^\]]*\],", "", ln)
        print('patched:', ln2.strip()[:80])
        out.append(ln2)
        continue
    if 'rachna:' in ln and seen_rachna:
        print('skipped duplicate rachna line')
        continue
    if 'rachna:' in ln:
        seen_rachna = True
    out.append(ln)
io.open(P, 'w', encoding='utf-8').write('\n'.join(out))
print('done')
