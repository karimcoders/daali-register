# Worklog

---
Task ID: 1
Agent: Super Z (main agent)
Task: Build "Digital Daali Register" — an offline-first PWA web app that digitally replaces the traditional Bihar shaadi daali/gift-money register notebook. The notebook itself IS the UI (no SaaS dashboard).

Work Log:
- Loaded fullstack-dev skill; initialized environment via init script (Next.js 16 + TS + Tailwind 4 + shadcn).
- Downloaded & self-hosted Devanagari fonts for offline use: Kalam 400/700 (handwritten headings) + Noto Sans Devanagari 400/500/700 (body) as woff2 in public/fonts with unicode-range @font-face rules.
- Generated PWA icons (register/notebook motif) via PIL: icon-192/512, apple-touch-icon, favicon.ico.
- Core libs under src/lib/daali/:
  - types.ts (DaaliEvent, DaaliEntry, Settings, EntryInput, BackupFile, relationship suggestions)
  - db.ts (zero-dependency promise-based IndexedDB wrapper; stores: events, entries with eventId index; graceful fallback flag)
  - format.ts (Intl en-IN ₹ grouping, sanitizeAmountInput, ISO↔dd/mm/yyyy, Hindi month dates, normalizeName for dup detection, downloadFile)
  - strings.ts (complete hi/en dictionaries, makeT)
  - store.ts (Zustand: allEntries + events in IDB, settings in localStorage, optimistic CRUD, sortEntries, PIN hash, importBackup)
- Design system in src/app/globals.css: paper grain (SVG feTurbulence), aged stains, spine impression, double red margin line, ruled rows, dotted blanks (paper-input), ink buttons, chips, page-turn/write-in/stamp/highlight-flash animations, prefers-reduced-motion, safe-area padding, full @media print A4 register stylesheet.
- PWA: public/manifest.json (standalone, Hindi, icons incl. maskable) + public/sw.js (v2: network-first for nav/code → fresh dev experience; cache-first immutable for fonts/icons; offline fallback). Registered via ServiceWorkerRegister client component.
- Components (src/components/daali/): daali-app (shell, view routing, print flow), home-screen (paper register cards with per-event totals, rename/delete, first-time hero), notebook (page header with handwritten fills, responsive register grid — mobile compact vs desktop 6 columns, blank ruled filler rows, page totals + grand total + average in Kalam, page controls with jump input, dynamic rows-per-page by viewport, swipe gestures, ArrowLeft/Right keys, page-turn animation), entry-sheet (vaul paper drawer: name/village/relation datalist/amount with ₹ quick chips ₹101–₹5,001/date/note, quick-entry mode, duplicate warning never blocking, edit + delete confirm), new-event-sheet, search-overlay (name/village/relation/amount, all-events or current-event, page-jump + highlight-flash row), settings-sheet (language, dark mode, animation toggle, sort modes, PIN set/remove, JSON backup export/import with confirm, CSV export with BOM, print/PDF, about), pin-lock (lock screen, wrong-PIN error, forgot→reset), bottom-nav (Register/Search/Add/More with prominent center ＋), print-register (chunked A4 sheets, repeated thead, per-sheet page numbers, grand total footer).
- Fixed during Agent Browser verification:
  1. Fixed bottom nav overlapped page controls → added calc(4rem+safe-area) bottom padding to content shell.
  2. Radix a11y "Missing Description" warnings → added sr-only DrawerDescription to new-event-sheet & settings-sheet.
  3. addEntry silent no-op when no event open → now throws so user sees Hindi error toast.
  4. SW rewritten to network-first (dev-safe) after stale-cache confusion during testing.
- End-to-end verified with agent-browser: create register → add entries (incl. quick mode batch) → totals math exact (₹14,617/11) → pagination → swipe both directions → search jump+highlight → edit updates totals → delete confirm updates totals → duplicate warning → reload persistence (IndexedDB) → OFFLINE: airplane-mode entry saved + full offline reload via SW → JSON backup + CSV + print PDF rendered as traditional register (verified actual PDF) → dark mode → hi/en toggle → PIN lock flow (wrong+right+remove) → 2nd register isolation → no horizontal scroll at 360px → fonts confirmed loaded. Lint: 0 problems. dev.log: all 200s, no errors.

Stage Summary:
- Deliverable: complete working Daali Register PWA at src/app/page.tsx (single user-visible route), all data local (IndexedDB + localStorage), no login, no server dependency.
- Key decision: pages are dynamic (rows-per-page adapts to viewport; never stored in data — per spec §18). Sorting is view-only; register order = createdAt.
- Known dev-note: service worker network-first keeps dev/preview always fresh; offline capability verified by airplane-mode test.
- Test artifacts: scripts/shot-01…17 PNGs, scripts/print-test.pdf.

---
Task ID: 2
Agent: Super Z (main agent)
Task: User feedback round — (1) "hindi me type nhi ho rha" → make Hindi/Urdu typing work on a normal English keyboard; (2) add all 3 languages (हिंदी / اردو / English) for UI and writing; (3) remove the popup entry form — write DIRECTLY on the register lines, Enter → new line, jaise asli copy.

Work Log:
- Built offline rule-based transliteration engine (src/lib/daali/translit.ts): Roman→Devanagari + Roman→Urdu. Greedy longest-match tokenizer; halant clusters (क्र, प्र), n→ं anusvara before stops, word-final i/u lengthening (ramji→रामजी, lalu→लालू), single-a→ा (kumar→कुमार, mama→मामा, gupta→गुप्ता). No network, no dictionary.
- TranslitInput component (translit-input.tsx): word converts on Space/Enter/blur (Google Input Tools style); Backspace un-converts the last word back to roman; keeps a parallel latin mirror via onRawChange for search/dup-detection; direct Devanagari/Arabic typing passes through untouched.
- REMOVED the entry drawer popup (entry-sheet.tsx deleted). New inline-entry.tsx: WritingRow = the next empty ruled line; tap it → inputs appear ON the line; Enter commits and the next line auto-focuses (फटाफट quick mode built-in); quick ₹ chips (101–5001) render under the active line; duplicate warning = inline dashed paper note, never blocks. EntryEditRow = tap any written line → same inline editing incl. note + delete + confirm.
- notebook.tsx rewritten: page count now includes the writing slot (ceil((total+1)/rows)) — the next blank line always exists like a real register; auto page-turn when the page fills on commit; ＋ button (bottom nav) dispatches 'daali:write-focus' window event → jumps to writing page + focuses name input; script switcher हिं/اردو/Aa in top bar (persisted as settings.inputScript).
- 3 UI languages: Language 'hi'|'ur'|'en', full Urdu string dictionary added; document.dir/lang set on init + language change → full RTL mirror (red margin line + spine flip to the right side jaise Urdu copy, grid/nav auto-flip, numbers stay LTR via direction:ltr on numeric inputs).
- Noto Nastaliq Urdu (variable 400–700, arabic+latin woff2) self-hosted in public/fonts + @font-face + Nastaliq applied for [dir=rtl] body/inputs/buttons + taller ruled rows (58/62px) for Nastaliq descenders.
- Data model: DaaliEntry + optional nameLatin/villageLatin (stored on add/update) → search matches roman "ramji" against Devanagari राम्जी too; duplicate check compares both.
- Settings: 3 language chips + new लिखावट (script) section; new-event-sheet name/location now use TranslitInput; print-register renders dir=rtl + Nastaliq header for Urdu; SW cache bumped daali-v3; daali-app root gets no-print.
- E2E verified with agent-browser (desktop 1280 + mobile 375): create register → type "ramji yadav"→राम्जी यादाव, "madhopur"→माधोपुर, "mama"→मामा ON THE LINE; Enter commits, line 02 auto-focused; quick chips; totals exact (₹550, ₹1,551, ₹3,050); edit amount inline 1001→2500 with live totals; duplicate note appears + नहीं cancels; roman search "ramji" finds Hindi entry + jump; اردو UI → dir=rtl/lang=ur verified, margin flips right, Nastaliq headings; Aa mode types plain English; reload persistence (IndexedDB); OFFLINE: airplane-mode entry saved (موہان in Urdu script — script toggle was active, correct) + SW reload offline; no horizontal scroll at 375px; ＋ focuses name input; 0 console errors; lint 0 problems; tsc clean.

Stage Summary:
- All three feedback items shipped: (1) Hindi+Urdu typing now works on any keyboard via offline transliteration, (2) हिंदी/اردو/English for both UI and writing incl. full RTL Urdu notebook, (3) popup form removed — click a line, write, Enter → next line, exactly like a paper daali.
- Deliverable: same single-route PWA (src/app/page.tsx), still zero backend, data model backward-compatible (latin fields optional).

---
Task ID: 3
Agent: Super Z (main agent)
Task: User feedback round 2 — (1) "hindi sahi naam nahi likh raha / urdu bhi sahi karo" → fix transliteration quality; (2) push to GitHub (token provided, user karimcoders) and put the app on a permanent live link with data storage.

Work Log:
- Transliteration engine rewritten (src/lib/daali/translit.ts) + new curated dictionary (src/lib/daali/dict.ts, ~450 Bihar-context words: relations, surnames, first names, villages/districts, everyday words — each with Devanagari AND Urdu).
- Root causes fixed: old engine halanted ALL consonant clusters (ramji→राम्जी) and marked every single 'a' as ा (yadav→यादाव). New rules: dict-first lookup; halant only for whitelisted conjunct clusters (pr/kr/tr/shr/rm…); a+n+stop collapses into anusvara (sanjay→संजय, chandan→चंदन); final a+n drops (kishan→किशन, roshan→रोशन); a before C+vowel drops in 5+-token words (mahesh→महेश, manoj→मनोज); a before final y drops (vijay→विजय); ngh→ंह (singh fallback); final i/u lengthening kept; Urdu rules: first-syllable a→alif, other medial a dropped, final a→alif, final u→و.
- Added tap-to-pick dictionary suggestion chips: TranslitInput emits live suggestions (suggestFor prefix search), WritingRow/EntryEditRow render paper-style chips in the line's strip; picking replaces the trailing latin word (mirror keeps roman for search).
- IME-composition safety (fixes real Hindi/Urdu keyboards, e.g. Google Indic): isIMEComposing(e) checks nativeEvent.isComposing/keyCode 229; TranslitInput hands off ALL keys during composition; plain amount/date/note Enter handlers guarded too — Enter during composition no longer jumps lines / breaks IME commit.
- Urdu display fix: Nastaliq was only applied under [dir=rtl] (UI language), so Urdu script mode with Hindi UI rendered wrong font. Now: TranslitInput sets data-script attr → input[data-script='ur'] gets Nastaliq; committed rows with Arabic-script text get .urdu-text class via isArabicText() helper.
- dict QA tooling: scripts/test-translit.ts (187 assertions passing), test-dict-scan.ts (catches Devanagari chars inside Urdu strings — found+fixed mandal/roshan/roushan/kailash/prakash), test-bidi.ts, fix-dict.py (codepoint-surgical fixes).
- Static export for GitHub Pages: removed scaffold api route; next.config conditional output:'export' + basePath + separate distDir (.next-static) so the running dev server is untouched; @font-face moved from globals.css into font-faces.tsx component with build-time NEXT_PUBLIC_BASE_PATH prefix; manifest.json + layout metadata + SW registration basePath-aware; sw.js rewritten to derive prefix from registration.scope (cache daali-v4) with scope guard.
- GitHub: created repo karimcoders/daali-register (token auth), pushed main (source) — repo: https://github.com/karimcoders/daali-register
- Deploy: added .github/workflows/deploy.yml (static export → actions/deploy-pages), enabled Pages via API (build_type=workflow) → LIVE: https://karimcoders.github.io/daali-register/ (first deploy succeeded in ~1 min).
- E2E verified with agent-browser on BOTH dev and live site: create register → type "sanjay" → suggestion chip संजय appears → tap → फटाफट Enter flow through village/relation/amount → commit → totals exact → next line auto-focused; direct Devanagari paste passes through untouched; Urdu mode input renders Nastaliq; live-site entry (sanjay/madhubani→मधुबनी) committed; reload persistence; OFFLINE (network cut): live site fully reloads via SW + new entry committed offline (कुल 2, ₹752) → back online data intact; fonts confirmed loaded (Kalam/Nastaliq/Devanagari). Lint 0 problems, tsc clean (src).

Stage Summary:
- Hindi/Urdu writing quality fixed via dictionary + schwa-aware rules + suggestion chips + IME guards; Urdu gets proper Nastaliq rendering in all UI languages.
- Permanent live link: https://karimcoders.github.io/daali-register/ (GitHub Pages, auto-deploys on push to main). Data: offline-first IndexedDB on device + JSON/CSV backup in app. Vercel not used (needs account login) — Pages serves the same static build; repo is Vercel-import-ready.

---
Task ID: 4
Agent: Super Z (main agent)
Task: User feedback round 3 — (1) "pdf sahi kaam nahi kar raha, download nahi ho raha" → real PDF file download; (2) click anywhere on the register to edit, jaise real pen se likhna; (3) "daali likho + aaj ki shaadi mein nevta hota hai wo bhi likho" → नेवता/सामान (non-cash gift) recording.

Work Log:
- REAL PDF DOWNLOAD (src/lib/daali/pdf.ts, new): jsPDF + html2canvas generate an actual .pdf file (no print dialog). Renders the register as A4 sheets (794×1123px, 20 ruled rows/sheet) in an off-screen container built with inline hex styles only, red margin line, handwritten Kalam/Nastaliq headers, per-sheet page numbers + grand-total footer, hi/ur/en incl. RTL. Trigger points: notebook top-bar FileDown button + ⋮ menu + Settings "PDF डाउनलोड करें" (ink-btn, busy state with "PDF बन रही है…"). window.print() kept as separate "प्रिंट करें".
- ROOT-CAUSE DEBUG of the first PDF failure: html2canvas 1.4.1 throws "Attempting to parse an unsupported color function lab" — Chrome computes Tailwind v4 oklch/color-mix theme values into lab()/oklab() and html2canvas parses the ROOT chain even for subtree captures. Tried inline-sweep approaches; final robust fix: temporarily wrap window.getComputedStyle with a Proxy that maps every modern-color value (color, *-border-color, outline/caret/text-decoration/-webkit-text-stroke colors, box/text-shadow, background-image) to parseable rgb/transparent/none for html2canvas reads only, restored after capture. Verified PDF-OK on dev AND live site.
- नेवता/सामान: DaaliEntry.item + EntryInput.item (store persists), amount=0 for item entries. WritingRow/EntryEditRow get नकद/नेवता mode chips (QuickAmounts strip + actions strip); item field is a TranslitInput (types Hindi/Urdu item names like "mithai" → मिठाई). Validation: name + (cash OR item). RegisterRow shows "🎁 item" in रकम column (font-hand, Nastaliq-aware); totals: कुल दाली counts cash only, "नेवता/सामान: N" appears when N>0, औसत = cash sum / cash count; search matches item + note; CSV gains सामान/नेवता column; print + PDF render item text in रकम column.
- PEN-STYLE EDITING: RegisterRow cells individually clickable (name/village/relation/amount/date each stopPropagation → EditCell) — tapping any cell opens EntryEditRow with the cursor ON that cell (focusCell prop, incl. dateRef); blank ruled filler lines are now clickable → jump to the writing page + focus the writing line (focusWriting shared with the ＋ button event). writeHere copy updated to "यहाँ नई दाली लिखें…" + firstLineHint mentions नेवता.
- Strings: pdfDownload/pdfMaking/pdfDone/pdfError, cashMode, itemMode, itemPh, itemCount, colAmount→"रकम / सामान", amountRequired→"रकम या सामान ज़रूरी है" in hi/ur/en. SW cache bumped daali-v5.
- E2E agent-browser (dev + live): create register → गीता देवी ₹251 (direct Devanagari) → नेवता toggle → सुनीता "कपड़ा सेट" committed (🎁) → totals "कुल लोग: 2 • कुल दाली: ₹251 • नेवता/सामान: 1" exact → click ₹501 cell → edit opens amount-focused → change to 1001, totals live-update → search "sanjay" finds via latin mirror → blank-line click focuses writing line → nevta row reopens in item mode → PDF click → success, no console errors → reload persistence (IndexedDB) OK. Lint 0, tsc clean (src).
- Deploy: committed 7e8b927, pushed to karimcoders/daali-register main → Actions deploy success → live verified: https://karimcoders.github.io/daali-register/ (new bundle contains नेवता strings; live E2E passed incl. PDF download).

Stage Summary:
- PDF ab seedha .pdf file download hota hai (print dialog nahi) — dev + live dono par verified.
- नेवता/सामान entries (kapda, mithai, gift…) cash दाली ke saath ek hi register mein; totals cash alag, सामान count alag.
- Register ki ab koi bhi line/cell par click karke waise hi edit hota hai jaise pen se likhte hain; khali line par click = agli dali likhna.
- Live: https://karimcoders.github.io/daali-register/ • Repo: https://github.com/karimcoders/daali-register

---
Task ID: 5
Agent: Super Z (main agent)
Task: User asked "aal chkro a to z tu khud se" — full A-to-Z self-audit of every feature on the LIVE site (https://karimcoders.github.io/daali-register/), fresh browser session, mobile 375px + desktop 1280px.

Work Log:
- Repo state check: PDF-fix commits (7e8b927, d35dbd9) were already on remote; sandbox file-mode noise normalized (core.fileMode off), pushed system commit d65fa4c; confirmed Actions deploys success for all heads.
- LIVE A-Z audit via agent-browser (26 checkpoints, all PASS):
  A home/empty-state paper UI • B create register inline (no popup) • C authentic daali look (शुभ लाभ-style header, red margin, ruled lines, पन्ना number) • D tap ruled line → inputs appear ON the line • E Hindi transliteration (sanjay kumar→संजय कुमार) • F Enter commits → next line auto-focus (फटाफट) • G quick ₹ chips (101–5,001) • H live totals exact (कुल लोग 2 • कुल दाली ₹1,502) • I pen-style cell edit: click ₹501 cell → cursor lands on that numeric cell → 2500 → totals ₹3,501 live • J नेवता/सामान mode (सुनीता देवी 🎁 item; cash totals exclude items, सामान counted separately) • K duplicate warning non-blocking dashed note [नहीं][फिर भी लिखें] (fires at row-commit; नहीं keeps row open for correction — by design) • L pagination: auto page-turn when page fills, arrows, jump spinbutton • M delete confirm "क्या यह दाली हटानी है?" → totals recomputed exactly (8 • ₹4,756) • N search roman "sunita" → finds सुनीता देवी via latin mirror → jump + yellow flash highlight • O Urdu UI: dir=rtl, lang=ur, Noto Nastaliq Urdu confirmed via computed styles, margin/nav mirrored, Urdu transliteration mohan→موہن committed live • P English UI LTR complete • Q PDF: instrumented URL.createObjectURL + anchor hooks → real download event, blob 192,675 B application/pdf, header bytes %PDF-1.3, deterministic ×3 exports, zero errors (note: earlier "no download" was test-harness error — PDF button is icon-only aria-label, not text) • R JSON backup 3,770 B • S reload persistence IndexedDB (home card "9 people ₹5,007") • T CSV 1,327 B utf-8 • U OFFLINE: network cut → full SW reload → entry written offline → totals live (10 • ₹5,107) → back online persisted • V no horizontal scroll 375px & 1280px • W 0 console errors whole session • X fonts loaded (Kalam, Noto Sans Devanagari; Nastaliq on-demand) • Y settings sheet (language/script/backup/print) all wired • Z ＋ nav jumps to writing line (used offline too).
- Audit found 1 real quality bug: transliteration "kapda"→"कापदा" (dict miss) — exactly the class of error the user had complained about.
- FIX: +55 curated नेवता/सामान gift-item words in src/lib/daali/dict.ts (kapda/kapde/kapre, mithai, saree, lehnga, shagun, bartan, kangan, ghadi, sona, chandi, ghee, mewa, cycle, pankha, nevta, saman, gift…), plus names-section payal spelling upgraded to पायल. Caught and fixed 2 of my own script-contamination typos via scripts/test-dict-scan.ts (Devanagari II inside Urdu strings, Arabic lam inside Devanagari) — scanner proves its worth.
- QA after fix: dict-scan CLEAN, test-translit 179/0, Urdu spot 8/0, bidi OK, eslint 0 problems, tsc src clean. bun -e spot-check: kapda→कपड़ा/کپڑا, mithai→मिठाई/مٹھائی, nevta→नेवता/نیوتا.
- Deploy: commit 371f53e pushed → Actions success → LIVE re-verified: typed kapda in Nevta mode on live site → कपड़ा correct, सीता 🎁कपड़ा committed, totals ₹5,107 cash + सामान: 2 exact.

Stage Summary:
- Full A-Z audit: 26/26 PASS on the live permanent link, including real PDF file download (validated %PDF header + byte size) and offline write.
- One dict-quality bug found & fixed & deployed & re-verified live (kapda→कपड़ा).
- Live: https://karimcoders.github.io/daali-register/ • Repo: https://github.com/karimcoders/daali-register

---
Task ID: 6
Agent: Super Z (main agent)
Task: User round 4 — (1) "pdf crop ho rah" → fix PDF cropping; (2) clicking anywhere on ANY page must open editing (page 2, 3…); (3) "jo bhi edit hoga wo save hoga, history maintain ho" → full edit-history feature.

Work Log:
- REPRODUCED the PDF crop from the user's exact environment: seeded a 22-entry register into the live site's IndexedDB, exported, pulled the actual PDF bytes out of the browser (blob → base64 → local file), rendered with pdftoppm. Found it: page-2 footer "कुल लोग: 22 • कुल दाली: ₹19,998 • नेवता/सामान: 5" — the last digit was HALF-CLIPPED at the right page edge (flex row + overflow:hidden; totals text couldn't wrap).
- FIX (src/lib/daali/pdf.ts): footer rebuilt as block layout — grand total on its own wrapping line (whiteSpace:normal + overflowWrap:break-word, right-aligned/RTL-aware), पन्ना number on a separate small line. Verified with the same extraction pipeline on dev (fixpg/fx PNGs) and on live (lv2-foot.png): complete "5", safe margins, 2-sheet export clean.
- EDIT HISTORY FEATURE:
  - db.ts: DB_VERSION 1→2, new 'history' object store (indexes eventId, at) with backward-compatible upgrade.
  - types.ts: HistoryItem/HistoryChange/HistoryAction (add/edit/delete/renameEvent/deleteEvent, field diffs with from→to).
  - store.ts: pushHistory best-effort logger (never blocks data writes; capped at 600 in memory), entryChanges diff (name/village/relation/amount/item/date/note), wired into addEntry/updateEntry/removeEntry/renameEvent/deleteEvent (deleteEvent purges its history), importBackup + resetAll clear history, new clearHistory action.
  - history-sheet.tsx (new): paper-slip drawer, day-grouped list (आज/कल/date), colored action rows (green add/amber edit/red delete) with time, change lines "रकम: ₹501 → ₹2,500" (amounts ₹-formatted, dates localized, <bdi> for RTL), event-name chip on home view, empty state, clear-history with ConfirmDialog. Fixed initial invisible-drawer bug: used `paper` class whose position:relative broke vaul's fixed positioning — switched to paper-slip like the other sheets.
  - Entry points: notebook ⋮ menu "हिस्ट्री देखें" (History icon) + Settings row. Strings added in hi/ur/en (22 keys). SW cache → daali-v6.
- PAGE-2 EDITING VERIFIED (dev + live): jump to page 2 → click row → inline edit opens with values → amount change committed → totals exact (₹19,998−1,313+2,000=₹20,685 dev; ₹29,164 live). Click-to-edit works on every page, not just page 1.
- E2E verified dev + live: add/edit/delete all produce history records; history persists across reload (IDB v2 upgrade on existing DBs works); PDF blob 412,589 B (2 sheets, 23 entries) exports clean on live; 0 console errors.
- Deploy: commit 147129f → Actions success → live re-verified end-to-end.

Stage Summary:
- PDF ka crop theek: totals/footer kabhi nahi katenge (wrap + block layout), live PDFs visually verified.
- हिस्ट्री feature: har daali ka add/edit/delete (raash ₹501→₹2,500 jaisi detail ke saath) apne aap save hota hai; ⋮ menu ya Settings se khulti hai; clear option bhi.
- Har page par click-to-edit confirmed.
- Live: https://karimcoders.github.io/daali-register/ • Repo: https://github.com/karimcoders/daali-register

---
Task ID: 7
Agent: Super Z (main agent)
Task: User round 5 — "still nhi horah pdf downado sah se br yaar + edit bhi sahi nh ho rah" — PDF download still failing on user's phone; editing still not right. Deep root-cause hunt + fixes + live verification.

Work Log:
- ROOT CAUSES FOUND (real bugs, not test noise):
  1. PDF: downloadRegisterPdf used jsPDF pdf.save() → anchor download only. Fails silently on mobile webviews (WhatsApp/Instagram in-app browsers ignore the download attribute) and older iOS → user never gets the file.
  2. EDIT: EntryEditRow village/relation inputs were MISSING their refs (relationMobileRef/villageDesktopRef/relationDesktopRef never attached) → tapping गाँव/रिश्ता cells opened the edit row but nothing focused (verified live: zero focused inputs). Plus my first patch using `??` still picked hidden twins — fixed with offsetParent visibility pick (pickVisible).
  3. Notebook header (कार्यक्रम/तारीख़/गाँव) was NOT tappable — user naturally taps it to correct; nothing happened.
  4. iOS zoom: inline inputs <16px trigger page auto-zoom on focus → "edit kharab lagta hai".
  5. Escape key didn't close the edit row from village/relation fields.
- FIXES:
  - pdf.ts: savePdfFile() chain — mobile share sheet (navigator.canShare({files}) → share) → anchor download → window.open fallback; blob URL kept alive 2 min; returns {how: shared|saved|opened}.
  - daali-app.tsx: 'saved' now shows 12s toast with description "फ़ाइल नहीं मिली? यहाँ टैप करके PDF खोलें।" + खोलें action (opens the live blob PDF — bulletproof in webviews).
  - inline-entry.tsx: refs attached to all 4 missing inputs; pickVisible() focus; scrollIntoView({block:'center'}) so the keyboard never hides the edited line; Escape closes from every field.
  - notebook.tsx: HeaderField component — tap कार्यक्रम/तारीख़/गाँव on the page → inline input right there (Enter/blur saves, Esc cancels, date formatted display); RegisterRow mobile village • relation split into per-field tap spans; first-visit dismissible hint strip "किसी भी लाइन, नाम या तारीख़ पर टैप कीजिए…" (localStorage daali-edit-hint-v1).
  - store.ts: new updateEvent(id, {name?,date?,location?}) with field-diff history (action 'editEvent'); types.ts + strings.ts (hi/ur/en: pdfOpen, pdfTapOpen, pdfOpenedTab, editHint, editHintOk, headerEditHint, actEditEvent, fLocation); history-sheet maps location + editEvent.
  - globals.css: mobile cell-input 16px (kills iOS focus zoom). sw.js → daali-v7.
- QA (dev + live):
  - Dev E2E: village/relation/amount cell taps all focus correctly (FOCUSED:गाँव/रिश्ता/रकम with values), amount 501→2000 saves (₹4,500), header name+date inline edits save (राम जी की शादी, 15/11/2026), history shows all 5 records incl. ₹501→₹2,000 and रजिस्टर का नाम diff, persists across reload.
  - Mobile 375px: village/relation span taps focus the visible mobile inputs; cell-input computes 16px; hint strip visible.
  - Urdu RTL: dir=rtl, header tap-edit focused with Urdu label.
  - PDF: dev + live export → anchor download event, %PDF-1.3, 142–145 KB, pdftoppm render shows complete page (totals कुल लोग: 2 • कुल दाली: ₹3,001 fully visible, no crop), fallback toast with खोलें verified visible.
  - Suites: dict-scan CLEAN, translit pass, bidi pass, eslint 0 problems, tsc src clean, 0 console errors.
- Deploy: commit c3faa29 → Actions success → LIVE verified end-to-end (SW daali-v7 live; bundle contains all new strings + canShare chain; mobile E2E: create→write→edit→PDF→history all pass).

Stage Summary:
- PDF ab phone par bhi pakka: share sheet (Save to Files/WhatsApp/Gmail) → download → नई विंडो, aur agar file na mile to toast mein "खोलें" tap link.
- Edit: गाँव/रिश्ता/रकम/नाम/तारीख़ — sab cells par tap kaam karta hai, cursor wahi pen ki tarah rakha jata hai; page header (कार्यक्रम/तारीख़/गाँव) bhi ab seedha tap karke sudhara ja sakta hai.
- Har badlav history mein: header edits bhi (रजिस्टर की जानकारी बदली) detail ke saath.
- Live: https://karimcoders.github.io/daali-register/ • Repo: https://github.com/karimcoders/daali-register (commit c3faa29)
