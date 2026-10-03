# दाली रजिस्टर — Daali Register

Shaadi daali ka digital register — बिहार की शादी की दाली (गिफ्ट-पैसा रजिस्टर) की डिजिटल कॉपी।
**Copy jaisi dikhe, copy jaisi chale, lekin digital ho.**

## Live

- **GitHub Pages (permanent link):** https://karimcoders.github.io/daali-register/
- Installable PWA — phone ke browser se "Add to Home screen" karein.

## Features

- 📓 **Register jaisi UI** — kaagaz jaisi dali, line-per line **seedha likhein** (koi popup nahi), **Enter** dabao → nayi line, bilkul asli copy jaisa.
- 📝 **3 bhasha likhne ke liye:** हिंदी / اردو / English — English keyboard se type karein, shabd apne aap Devanagari/Nastaliq me convert hote hain (offline, bina internet). Dictionary suggestions ke saath (yadav → यादव, patna → पटना…). Phone ke Hindi/Urdu keyboard se seedha likhna bhi kaam karta hai (IME-safe).
- 🧾 Kya-kya: kai shaadi ke alag register, page number + pages, quick ₹ chips (101–5001), kul-jod (कुल लोग / कुल दाली), search + page-jump, sudhar/delete, duplicate naam reminder, backup JSON/CSV, print/PDF (register look), PIN lock, dark mode.
- 📴 **Offline-first:** IndexedDB me data, Service Worker + PWA — bina internet sab kuch chalega. Data device me hi rehta hai, kahin upload nahi hota.

## Tech

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · IndexedDB · Service Worker/PWA. 
Zero backend, zero tracking. MVP pura tarah local hai; aage cloud-backup ke liye API add ki ja sakti hai.

## Dev

```bash
bun install
bun run dev        # http://localhost:3000
bun run lint
```

## Static deploy (GitHub Pages)

Repo me GitHub Action laga hai: `main` pe push karte hi static build karke Pages pe deploy ho jata hai.

```bash
# manual build:
STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/daali-register NEXT_DIST_DIR=.next-static bunx next build
# output: .next-static/
```

## Backup

⚙️ More → डेटा सेव करें (JSON) — file ko sambhal kar rakhein; naye phone me डेटा वापस लाएँ se restore karein.
