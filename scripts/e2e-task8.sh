#!/usr/bin/env bash
# Task 8 E2E — auto page-turn, WhatsApp per-entry share, phone edit, real PDF bytes
set -u
AB="agent-browser"
SHOT=/home/z/my-project/scripts
LOG=/home/z/my-project/scripts/e2e8.log
: > "$LOG"
step() { echo "== $1" | tee -a "$LOG"; }
pass() { echo "PASS: $1" | tee -a "$LOG"; }
fail() { echo "FAIL: $1" | tee -a "$LOG"; }

$AB close --all >/dev/null 2>&1 || true
$AB set viewport 1280 720 >/dev/null
$AB open http://localhost:3000/ >/dev/null
sleep 2
# fresh state: wipe IndexedDB + localStorage, reload
$AB eval "(() => new Promise(res => { const r = indexedDB.deleteDatabase('daali-register'); r.onsuccess = r.onerror = r.onblocked = () => res('ok'); setTimeout(()=>res('timeout'), 3000); }))()" >/dev/null 2>&1
$AB eval "localStorage.clear(); 'cleared'" >/dev/null 2>&1
$AB reload >/dev/null
sleep 2.5

step "A1 create register"
$AB find text "नया रजिस्टर" click >/dev/null 2>&1 || $AB find text "अपना पहला रजिस्टर बनाएं" click >/dev/null 2>&1
sleep 1
$AB snapshot > "$SHOT/e2e8-sheet.png" 2>/dev/null || true
# name field in sheet
NAME_IN=$($AB get attr aria-label "शादी / प्रोग्राम का नाम" 2>/dev/null || echo "")
$AB fill 'input[aria-label*="शादी"], input[aria-label*="_eventName"]' "टेस्ट शादी" >/dev/null 2>&1 || \
  $AB keyboard type "टेस्ट शादी" >/dev/null 2>&1
sleep 0.5
$AB find text "रजिस्टर बनाएं" click >/dev/null 2>&1
sleep 1.5
URL=$($AB get url 2>/dev/null)
step "A2 url=$URL"
# notebook visible?
$AB is visible '[aria-label*="दाली रजिस्टर"]' 2>/dev/null && pass "notebook open" || fail "notebook open"

step "A3 fill a full page (6 rows at 1280x720) and expect auto page-turn"
# switch writing script to English (Aa) for deterministic typing
$AB click 'button[aria-pressed]:has-text("Aa")' >/dev/null 2>&1 || true
for i in 1 2 3 4 5 6; do
  # tap the writing line if it is inactive
  $AB find label "यहाँ नई दाली लिखें…" click >/dev/null 2>&1 || true
  sleep 0.4
  $AB fill 'input[aria-label="नाम"]' "मेहमान $i" >/dev/null 2>&1
  $AB press Enter >/dev/null 2>&1
  sleep 0.15
  $AB fill 'input[aria-label="रकम"]' "$((i * 100))" >/dev/null 2>&1
  $AB press Enter >/dev/null 2>&1
  sleep 0.7
done
sleep 1.5
PAGE=$($AB eval "document.querySelector('input[aria-label*=\"पन्ना\"], input[aria-label^=\"पन्ना\"]')?.value || document.querySelector('input[type=number][aria-label*=पन्ना]')?.value || '?'" 2>/dev/null | tr -d '"')
step "page value now: $PAGE"
if [ "$PAGE" = "2" ]; then pass "auto page-turn to page 2"; else fail "auto page-turn (page=$PAGE)"; fi

step "B1 WhatsApp share strip + wa.me link"
$AB eval "window.__lastOpen=null; const o=window.open; window.open=(u)=>{window.__lastOpen=String(u); return null;}; 'hooked'" >/dev/null 2>&1
$AB reload >/dev/null
sleep 2
$AB eval "window.__lastOpen=null; const o=window.open; window.open=(u)=>{window.__lastOpen=String(u); return null;}; 'hooked'" >/dev/null 2>&1
# click the first row's share icon
$AB click 'button[aria-label*="WhatsApp पर भेजें"]' >/dev/null 2>&1
sleep 0.6
$AB fill 'input[aria-label*="मोबाइल नंबर (WhatsApp)"]' "9431012345" >/dev/null 2>&1
sleep 0.3
$AB find text "भेजें" click >/dev/null 2>&1
sleep 1
OPENED=$($AB eval "window.__lastOpen || 'none'" 2>/dev/null | tr -d '"')
step "wa link: $OPENED"
case "$OPENED" in
  https://wa.me/919431012345\?text=*) pass "wa.me link with normalized number" ;;
  *) fail "wa.me link (got: $OPENED)" ;;
esac
DEC=$($AB eval "decodeURIComponent((window.__lastOpen||'').split('text=')[1]||'').includes('मेहमान') + '/' + decodeURIComponent((window.__lastOpen||'').split('text=')[1]||'').includes('रकम')" 2>/dev/null | tr -d '"')
step "message contains name/amount: $DEC"
[ "$DEC" = "true/true" ] && pass "receipt text has name + amount" || fail "receipt text ($DEC)"

step "B2 phone saved → next tap shares instantly (no strip)"
$AB eval "window.__lastOpen='yet'; 'reset'" >/dev/null 2>&1
$AB click 'button[aria-label*="WhatsApp पर भेजें"]' >/dev/null 2>&1
sleep 0.8
OPENED2=$($AB eval "window.__lastOpen || 'none'" 2>/dev/null | tr -d '"')
STRIP=$($AB is visible 'input[aria-label*="मोबाइल नंबर (WhatsApp)"]' 2>/dev/null)
step "second tap link: $OPENED2 ; strip visible: $STRIP"
case "$OPENED2" in
  https://wa.me/919431012345*) pass "instant share with saved number" ;;
  *) fail "instant share (got: $OPENED2)" ;;
esac

step "C1 edit-row phone field saves + history"
$AB press Escape >/dev/null 2>&1 || true
$AB click 'div[role="button"][aria-label*="मेहमान 2"]' >/dev/null 2>&1
sleep 0.6
$AB fill 'input[aria-label="मोबाइल नंबर (WhatsApp)"]' "9876543210" >/dev/null 2>&1
$AB find text "सेव" click >/dev/null 2>&1
sleep 1
# open history via ⋮ menu
$AB click 'button[aria-label="और"]' >/dev/null 2>&1 || $AB find label "और" click >/dev/null 2>&1
sleep 0.5
$AB find text "हिस्ट्री देखें" click >/dev/null 2>&1
sleep 1
HIST=$($AB eval "document.body.innerText.includes('मोबाइल नंबर')" 2>/dev/null | tr -d '"')
[ "$HIST" = "true" ] && pass "phone edit in history" || fail "phone edit in history"
$AB press Escape >/dev/null 2>&1 || true
sleep 0.5

step "D1 real PDF bytes"
$AB eval "window.__pdfB64=null; const c=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){ if(this.download){ fetch(this.href).then(r=>r.blob()).then(b=>{const fr=new FileReader(); fr.onload=()=>{window.__pdfB64=String(fr.result).split(',')[1];}; fr.readAsDataURL(b);}); } }; 'hooked'" >/dev/null 2>&1
$AB reload >/dev/null
sleep 2
$AB eval "window.__pdfB64=null; HTMLAnchorElement.prototype.click=function(){ if(this.download){ fetch(this.href).then(r=>r.blob()).then(b=>{const fr=new FileReader(); fr.onload=()=>{window.__pdfB64=String(fr.result).split(',')[1];}; fr.readAsDataURL(b);}); } }; 'hooked'" >/dev/null 2>&1
$AB click 'button[aria-label="PDF डाउनलोड करें"]' >/dev/null 2>&1
sleep 9
B64=$($AB eval "window.__pdfB64 ? window.__pdfB64.slice(0,40) : 'none'" 2>/dev/null | tr -d '"')
LEN=$($AB eval "window.__pdfB64 ? window.__pdfB64.length : 0" 2>/dev/null | tr -d '"')
step "pdf b64 prefix=$B64 len=$LEN"
if [ "$B64" != "none" ] && [ "$LEN" -gt 50000 ]; then
  $AB eval "window.__pdfB64" 2>/dev/null | tr -d '"' | base64 -d > "$SHOT/e2e8.pdf" 2>/dev/null
  head -c 8 "$SHOT/e2e8.pdf" | rg -q "%PDF" && pass "real PDF bytes ($LEN b64)" || fail "PDF header"
  pdftoppm -png -r 60 "$SHOT/e2e8.pdf" "$SHOT/e2e8-page" 2>/dev/null && pass "pdftoppm rendered" || fail "pdftoppm"
else
  fail "PDF bytes not captured ($B64 len=$LEN)"
fi

step "E1 mobile 375 layout + share column"
$AB set viewport 375 720 >/dev/null
sleep 1.2
OW=$($AB eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>/dev/null | tr -d '"')
ICON=$($AB is visible 'button[aria-label*="WhatsApp पर भेजें"]' 2>/dev/null)
step "h-overflow=$OW shareIconVisible=$ICON"
[ "$OW" = "0" ] && pass "no horizontal overflow at 375" || fail "overflow $OW"
[ "$ICON" = "true" ] && pass "share icon visible on mobile" || fail "share icon mobile"

$AB screenshot "$SHOT/e2e8-mobile.png" >/dev/null 2>&1
echo "=== DONE ===" | tee -a "$LOG"
