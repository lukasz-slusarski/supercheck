#!/usr/bin/env bash
#
# Branding "Uptime important.is" dla naszego wdrożenia Supercheck.
#
# DLACZEGO SKRYPT, A NIE ZWYKŁE ZMIANY W PLIKACH
# Nazwa "Supercheck" występuje w kilkudziesięciu widocznych stringach i w setkach
# identyfikatorów technicznych. Ręczne podmiany zamieniłyby każdy
# `git merge upstream/main` w pole minowe konfliktów. Skrypt jest idempotentny:
# uruchamiasz go po każdym scaleniu z upstreamem i branding wraca, bez
# rozstrzygania konfliktów linia po linii.
#
# UŻYCIE
#   git fetch upstream && git merge upstream/main
#   ./scripts/rebrand-important.sh
#   git add -A && git commit -m "Branding Uptime important.is"
#
# CZEGO SKRYPT CELOWO NIE RUSZA (licencja Supercheck, RESTRICTIONS punkt 4:
# "Remove or obscure copyright notices, licenses, or attribution")
#   - pliku LICENSE
#   - nagłówków copyright w kodzie oraz stopek "© ... Supercheck. All rights reserved."
#   - komponentu community-links.tsx, czyli odnośników do repozytorium
#     i Discorda autorów, to jest nasza widoczna atrybucja
#   - "Powered by Supercheck" wraz z odnośnikiem na publicznych status page'ach
#   - odnośników do supercheck.io (regulamin, polityka prywatności)
#
# CZEGO NIE RUSZA Z POWODÓW TECHNICZNYCH (zmiana psuje działanie, a użytkownik
# tego nie widzi)
#   - nazw pakietów i plików (supercheck-sw.js, supercheck.d.ts, @supercheck/cli)
#   - kluczy pamięci i kanałów Redisa (supercheck-theme, SUPERCHECK_*, supercheck:*)
#   - nazw komponentów i typów (SupercheckLogo, SuperCheckLoading)
#   - nagłówka User-Agent monitorów (zmiana wpływa na to, jak strony nas widzą)
#   - plików testowych *.spec.ts
#
# Zmieniamy wyłącznie to, co widzi użytkownik: tytuły kart, opisy stron,
# nazwę w panelu, ekrany logowania, treści maili i wiadomości testowych.

set -euo pipefail

cd "$(dirname "$0")/.."

MARKA="Uptime important.is"

echo "Branding \"${MARKA}\" — start"

# Podmiana literalna w jednym pliku. Idempotentna, bo po pierwszym przebiegu
# wzorzec źródłowy już nie występuje.
podmien() {
  local plik="$1" od="$2" na="$3"
  [ -f "$plik" ] || return 0
  grep -qF -- "$od" "$plik" 2>/dev/null || return 0
  python3 - "$plik" "$od" "$na" <<'PY'
import sys
plik, od, na = sys.argv[1], sys.argv[2], sys.argv[3]
with open(plik, encoding="utf-8") as f:
    tresc = f.read()
with open(plik, "w", encoding="utf-8") as f:
    f.write(tresc.replace(od, na))
PY
}

# Podmiana we wszystkich plikach pasujących do wzorca ścieżki.
podmien_wszedzie() {
  local od="$1" na="$2"
  shift 2
  local pliki
  pliki=$(grep -rlF -- "$od" \
    --include="*.tsx" --include="*.ts" \
    --exclude="*.spec.ts" --exclude="*.spec.tsx" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
    "$@" 2>/dev/null || true)
  [ -n "$pliki" ] || return 0
  echo "$pliki" | while read -r p; do
    [ -n "$p" ] && podmien "$p" "$od" "$na"
  done
  echo "  \"${od}\" → $(echo "$pliki" | grep -c .) plików"
}

# --- 1. Tytuły kart przeglądarki ---
# Wzorzec z pionową kreską jest wąski i nie łapie zdań, w których nazwa
# występuje w treści, na przykład w komunikatach o błędach czy dokumentacji API.
# Upstream zapisuje tytuły w obu kolejnościach, stąd dwa wzorce.
podmien_wszedzie "| Supercheck" "| ${MARKA}" app/src
podmien_wszedzie "Supercheck | " "${MARKA} | " app/src

# --- 2. Opisy stron (meta description) ---
podmien_wszedzie "Sign in to your Supercheck account" "Sign in to your ${MARKA} account" app/src
podmien_wszedzie "Create your Supercheck account" "Create your ${MARKA} account" app/src
podmien_wszedzie "Reset your Supercheck account password" "Reset your ${MARKA} account password" app/src
podmien_wszedzie "Supercheck authentication" "${MARKA} authentication" app/src
podmien_wszedzie "Supercheck alert notification" "${MARKA} alert notification" app/src

# --- 3. Widoczne napisy w interfejsie ---
podmien_wszedzie "Welcome to Supercheck" "Welcome to ${MARKA}" app/src
podmien_wszedzie "Sign up to get started with Supercheck" "Sign up to get started with ${MARKA}" app/src
podmien_wszedzie 'sr-only">Supercheck<' "sr-only\">${MARKA}<" app/src
podmien_wszedzie 'text-lg">Supercheck<' "text-lg\">${MARKA}<" app/src

# UWAGA: wzorzec musi zawierać zamykający nawias klamrowy. Samo "on Supercheck"
# łapie też "functi{on Supercheck}Logo" w deklaracji komponentu logo i rozwala
# składnię. Sprawdzone boleśnie 28.08.
podmien_wszedzie "} on Supercheck" "} on ${MARKA}" app/src
podmien_wszedzie "open Supercheck in a Chromium" "open ${MARKA} in a Chromium" app/src
podmien_wszedzie "JSON. Supercheck safely escapes" "JSON. ${MARKA} safely escapes" app/src

# Marka w nazwie asystenta AI. Pełna nazwa z "Uptime" czytałaby się tu ciężko
# ("Uptime important.is AI"), więc w tym jednym kontekście zostaje sama domena.
podmien_wszedzie "Supercheck AI" "important.is AI" app/src

# Nazwa obok logo w nagłówku publicznych widoków monitora i przebiegu.
# W tych plikach nazwa stoi w osobnej linii wewnątrz <Link>, więc podmieniamy
# linię zawierającą wyłącznie ją.
for PLIK_NAGLOWKA in \
  "app/src/components/monitors/monitor-detail-client.tsx" \
  "app/src/components/runs/run-details.tsx"; do
  [ -f "$PLIK_NAGLOWKA" ] || continue
  python3 - "$PLIK_NAGLOWKA" "$MARKA" <<'PY'
import sys
plik, marka = sys.argv[1], sys.argv[2]
linie = open(plik, encoding="utf-8").readlines()
zmiany = 0
for i, l in enumerate(linie):
    if l.strip() == "Supercheck":
        linie[i] = l.replace("Supercheck", marka)
        zmiany += 1
if zmiany:
    open(plik, "w", encoding="utf-8").writelines(linie)
PY
done
echo "  nagłówki widoków publicznych: sprawdzone"

# Nazwa w przełączniku projektu w panelu bocznym.
podmien "app/src/components/project-switcher.tsx" ">Supercheck<" ">${MARKA}<"
if grep -qF ">${MARKA}<" app/src/components/project-switcher.tsx 2>/dev/null; then
  echo "  panel boczny: \"${MARKA}\""
else
  echo "  panel boczny: UWAGA, nie znalazłem nazwy w project-switcher.tsx"
fi

# --- 4. Maile i wiadomości testowe ---
# W tych plikach nazwa występuje wyłącznie w treściach dla odbiorcy, bez
# identyfikatorów technicznych, więc podmieniamy blokowo. Pomijamy linie
# z odnośnikiem supercheck.io oraz stopkę copyright, bo to atrybucja.
PLIKI_TRESCI=$(find app/src/emails app/src/lib/processors app/src/app/api/notification-providers \
  -name "*.tsx" -o -name "*.ts" 2>/dev/null | grep -v "\.spec\." || true)
PLIKI_TRESCI="${PLIKI_TRESCI}
app/src/lib/email-renderer.ts"

LICZBA_TRESCI=0
while read -r plik; do
  [ -n "$plik" ] && [ -f "$plik" ] || continue
  grep -q "Supercheck" "$plik" || continue
  python3 - "$plik" "$MARKA" <<'PY'
import re, sys
plik, marka = sys.argv[1], sys.argv[2]
# Linii z atrybucją i identyfikatorami nie ruszamy.
POMIN = ("supercheck.io", "All rights reserved", "User-Agent",
         "SupercheckLogo", "SuperCheckLoading", "supercheck-logo",
         "SUPERCHECK_", "supercheck:")
zmienione = 0
wynik = []
for linia in open(plik, encoding="utf-8"):
    if "Supercheck" in linia and not any(p in linia for p in POMIN):
        nowa = re.sub(r"Supercheck(?! Community License)", marka, linia)
        if nowa != linia:
            zmienione += 1
        wynik.append(nowa)
    else:
        wynik.append(linia)
if zmienione:
    open(plik, "w", encoding="utf-8").writelines(wynik)
print(zmienione)
PY
  LICZBA_TRESCI=$((LICZBA_TRESCI + 1))
done <<< "$PLIKI_TRESCI"
echo "  treści maili i wiadomości testowych: ${LICZBA_TRESCI} plików przejrzanych"

# --- 5. Logo i ikony ---
# Zawartość jest wersjonowana w repozytorium, nie generuje jej ten skrypt.
# Sprawdzamy tylko, czy scalenie z upstreamu jej nie cofnęło.
LOGO="app/src/components/logo/supercheck-logo.tsx"
if grep -q "important-logo.png" "$LOGO" 2>/dev/null; then
  echo "  logo: nasze"
else
  echo "  logo: UWAGA, upstream nadpisał ${LOGO}"
  echo "        przywróć: git checkout important -- ${LOGO}"
fi

# Ikony są binarne, więc porównujemy z wzorcem trzymanym w app/public.
# Jeśli kiedyś zniknął branding ikon, odtwórz je skryptem scripts/ikony-important.py
if [ -f "app/public/important-logo.png" ]; then
  echo "  źródło logo: obecne"
else
  echo "  źródło logo: UWAGA, brak app/public/important-logo.png"
fi

# --- 6. Kontrola atrybucji ---
# Ten warunek jest w skrypcie celowo. Gdyby ktoś kiedyś usunął odnośniki
# do autorów, złamalibyśmy licencję, a bez tego sprawdzenia nikt by tego
# nie zauważył aż do rozmowy z prawnikiem.
# Upstream przeszedł z "Supercheck Community License" na AGPL-3.0 (PR #302).
# Akceptujemy obie, bo skrypt bywa uruchamiany też na starszych wersjach.
if [ -f "LICENSE" ] && grep -qE "Supercheck Community License|GNU AFFERO GENERAL PUBLIC LICENSE" LICENSE; then
  echo "  licencja: nietknięta"
else
  echo "  licencja: BŁĄD, brak pliku LICENSE albo zmieniona treść"
  exit 1
fi

if grep -q "github.com/supercheck-io" app/src/components/community-links.tsx 2>/dev/null; then
  echo "  atrybucja autorów: obecna"
else
  echo "  atrybucja autorów: BŁĄD, zniknęły odnośniki do repozytorium autorów"
  echo "  licencja tego zabrania (RESTRICTIONS punkt 4)"
  exit 1
fi

if grep -q "Powered by Supercheck" app/src/components/status-pages/status-page-branding.tsx 2>/dev/null; then
  echo "  atrybucja na status page: obecna"
else
  echo "  atrybucja na status page: BŁĄD, zniknęło \"Powered by Supercheck\""
  exit 1
fi

if grep -rq "All rights reserved" app/src/emails/base-layout.tsx 2>/dev/null; then
  echo "  copyright w stopce maili: obecny"
else
  echo "  copyright w stopce maili: BŁĄD, zniknęła stopka"
  exit 1
fi

echo "Branding \"${MARKA}\" — gotowe"
