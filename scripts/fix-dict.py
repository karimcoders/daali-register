#!/usr/bin/env python3
# Surgical fixes for dict.ts: Urdu strings contaminated with Devanagari
# codepoints + prakash ordering. Then append new entries.
import io

P = '/home/z/my-project/src/lib/daali/dict.ts'
s = io.open(P, encoding='utf-8').read()

def fix_urdu(entry_key: str, bad: str, good: str) -> bool:
    """Replace `bad` with `good` ONLY inside the Urdu (2nd) string of the entry."""
    global s
    marker = entry_key + ": ['"
    start = s.find(marker)
    if start < 0:
        print(f"  !! entry not found: {entry_key}")
        return False
    ur_start = s.find("', '", start) + 4
    ur_end = s.find("']", ur_start)
    ur = s[ur_start:ur_end]
    if bad not in ur:
        print(f"  !! {entry_key}: bad seq not in urdu part: {ur!r}")
        return False
    fixed = ur.replace(bad, good)
    s = s[:ur_start] + fixed + s[ur_end:]
    print(f"  fixed {entry_key}: {ur!r} -> {fixed!r}")
    return True

ok = True
ok &= fix_urdu('mandal',  '\u0932', '\u0644')  # ल -> ل
ok &= fix_urdu('roshan',  '\u0928', '\u0646')  # न -> ن
ok &= fix_urdu('roushan', '\u0928', '\u0646')  # न -> ن
ok &= fix_urdu('kailash', '\u0936', '\u0634')  # श -> ش
# prakash: ا placed after ر instead of after ک
ok &= fix_urdu('prakash', '\u067e\u0631\u0627\u06a9\u0634', '\u067e\u0631\u06a9\u0627\u0634')

NEW = ("  jay: ['\u091c\u092f', '\u062c\u06d2'], sagar: ['\u0938\u093e\u0917\u0930', '\u0633\u0627\u06af\u0631'], "
       "sajan: ['\u0938\u093e\u091c\u0928', '\u0633\u0627\u062c\u0646'],\n"
       "  gagan: ['\u0917\u0917\u0928', '\u06af\u06af\u0646'], pawan: ['\u092a\u0935\u0928', '\u067e\u0648\u0646'], "
       "vishal: ['\u0935\u093f\u0936\u093e\u0932', '\u0648\u0634\u0627\u0644'],\n"
       "  kapil: ['\u0915\u092a\u093f\u0932', '\u06a9\u067e\u0644'],\n")
if 'kapil:' not in s:
    s = s.replace('};', NEW + '};', 1)
    print('  added 7 new entries (jay, sagar, sajan, gagan, pawan, vishal, kapil)')

io.open(P, 'w', encoding='utf-8').write(s)
print('DONE' if ok else 'PARTIAL — check errors above')
