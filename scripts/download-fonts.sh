#!/bin/bash
# Download self-hosted fonts for offline PWA (Devanagari support)
set -e
FDIR=/home/z/my-project/public/fonts
mkdir -p "$FDIR"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

CSS=$(curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Noto+Sans+Devanagari:wght@400;500;700&display=swap")
echo "$CSS" > /tmp/fonts.css

python3 << 'EOF'
import re, subprocess, os

css = open('/tmp/fonts.css').read()
blocks = re.findall(r'/\*\s*([\w-]+)\s*\*/\s*@font-face\s*\{([^}]+)\}', css)
out_css = []
seen = set()
for subset, body in blocks:
    if subset not in ('devanagari', 'latin'):
        continue
    fam = re.search(r"font-family:\s*'([^']+)'", body).group(1)
    weight = re.search(r"font-weight:\s*(\d+)", body).group(1)
    url = re.search(r"url\((https://[^)]+\.woff2)\)", body).group(1)
    urange = re.search(r"unicode-range:\s*([^;]+);", body).group(1).strip()
    slug = fam.lower().replace(' ', '-')
    fname = f"{slug}-{weight}-{subset}.woff2"
    if fname in seen:
        continue
    seen.add(fname)
    path = f"/home/z/my-project/public/fonts/{fname}"
    subprocess.run(['curl', '-s', '-o', path, url], check=True)
    size = os.path.getsize(path)
    print(f"{fname}: {size} bytes")
    out_css.append(f"""/* {fam} {weight} {subset} */
@font-face {{
  font-family: '{fam}';
  font-style: normal;
  font-weight: {weight};
  font-display: swap;
  src: url('/fonts/{fname}') format('woff2');
  unicode-range: {urange};
}}""")

with open('/tmp/fontfaces.css', 'w') as f:
    f.write('\n'.join(out_css))
print("\nCSS written to /tmp/fontfaces.css")
EOF
