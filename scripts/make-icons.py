#!/usr/bin/env python3
"""Generate Daali Register PWA icons - a traditional Indian register/notebook."""
from PIL import Image, ImageDraw

def make_icon(size: int, path: str):
    s = size
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Background: warm desk-ish deep brown circle-free full square? Use warm cream square with rounded corners
    r = int(s * 0.18)
    # Outer background (deep warm brown like register cover edge)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=(139, 90, 43, 255))

    # Paper (off-white register page) inset
    m = int(s * 0.10)
    pr = int(s * 0.10)
    d.rounded_rectangle([m, m, s - m, s - m], radius=pr, fill=(251, 246, 233, 255))

    # Spine shadow on left of paper
    spine_w = int(s * 0.055)
    d.rounded_rectangle([m, m, m + spine_w, s - m], radius=pr, fill=(233, 222, 198, 255))

    # Red vertical margin line
    mx = m + spine_w + int(s * 0.05)
    d.line([(mx, m + int(s*0.05)), (mx, s - m - int(s*0.05))], fill=(185, 28, 28, 255), width=max(2, int(s * 0.018)))

    # Ruled horizontal lines (gray-blue)
    top = m + int(s * 0.16)
    bottom = s - m - int(s * 0.14)
    gap = (bottom - top) / 5.0
    lw = max(2, int(s * 0.012))
    for i in range(1, 6):
        y = top + gap * i
        d.line([(mx + int(s*0.05), y), (s - m - int(s*0.07), y)], fill=(168, 182, 205, 255), width=lw)

    # Handwritten "दाली" style scribbles: two dark ink strokes on first two lines
    ink = (33, 49, 63, 255)
    y1 = top + gap * 1
    d.line([(mx + int(s*0.08), y1 - int(s*0.035)), (mx + int(s*0.30), y1 - int(s*0.035))], fill=ink, width=max(3, int(s*0.03)))
    y2 = top + gap * 2
    d.line([(mx + int(s*0.08), y2 - int(s*0.035)), (mx + int(s*0.24), y2 - int(s*0.035))], fill=ink, width=max(3, int(s*0.03)))

    # Amount mark on right of first line (rupee-like)
    d.line([(s - m - int(s*0.22), y1 - int(s*0.035)), (s - m - int(s*0.09), y1 - int(s*0.035))], fill=(27, 79, 114, 255), width=max(3, int(s*0.03)))

    img.save(path, 'PNG')
    print(f"saved {path} ({size}x{size})")

make_icon(512, '/home/z/my-project/public/icons/icon-512.png')
make_icon(192, '/home/z/my-project/public/icons/icon-192.png')
make_icon(180, '/home/z/my-project/public/icons/apple-touch-icon.png')
make_icon(32, '/home/z/my-project/public/icons/favicon-32.png')

# favicon.ico
ico = Image.open('/home/z/my-project/public/icons/favicon-32.png')
ico.save('/home/z/my-project/public/favicon.ico', format='ICO')
print("saved favicon.ico")
