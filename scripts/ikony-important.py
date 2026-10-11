#!/usr/bin/env python3
"""
Odtwarza ikony brandingowe (favicon i ikony aplikacji) z logo important.is.

DLACZEGO OSOBNY SKRYPT
Ikony są binarne, więc `git diff` ich nie zapisuje, a `git checkout` cofa je
bez ostrzeżenia. Skrypt pozwala je odtworzyć w kilka sekund zamiast szukać
oryginałów. Uruchamiaj po scaleniu z upstreamem, jeśli
scripts/rebrand-important.sh zgłosi, że ikony nie są nasze.

UŻYCIE
    python3 scripts/ikony-important.py [ścieżka-do-logo-hi-res.png]

Domyślne źródło to app/public/important-logo.png, czyli ta sama grafika,
której używa komponent logo w interfejsie. Jeśli masz wersję o wyższej
rozdzielczości (4320x4320), podaj ją jako argument, wynik będzie ostrzejszy.
"""

import sys
from pathlib import Path

from PIL import Image

KATALOG_APLIKACJI = Path(__file__).resolve().parent.parent / "app"
ZRODLO_DOMYSLNE = KATALOG_APLIKACJI / "public" / "important-logo.png"


def kwadrat(obraz: Image.Image, rozmiar: int) -> Image.Image:
    """Kadruje logo do zawartości i wpasowuje w kwadratowe płótno.

    Kadrowanie jest potrzebne, bo źródłowy plik ma przezroczyste marginesy,
    a bez ich obcięcia ikona w karcie przeglądarki wychodzi zauważalnie
    mniejsza niż ikony innych stron.
    """
    obszar = obraz.getbbox()
    if obszar:
        obraz = obraz.crop(obszar)
    szerokosc, wysokosc = obraz.size
    skala = rozmiar / max(szerokosc, wysokosc)
    obraz = obraz.resize(
        (max(1, round(szerokosc * skala)), max(1, round(wysokosc * skala))),
        Image.LANCZOS,
    )
    plotno = Image.new("RGBA", (rozmiar, rozmiar), (0, 0, 0, 0))
    plotno.paste(
        obraz,
        ((rozmiar - obraz.size[0]) // 2, (rozmiar - obraz.size[1]) // 2),
        obraz,
    )
    return plotno


def main() -> int:
    zrodlo = Path(sys.argv[1]) if len(sys.argv) > 1 else ZRODLO_DOMYSLNE
    if not zrodlo.is_file():
        print(f"Brak pliku źródłowego: {zrodlo}")
        return 1

    logo = Image.open(zrodlo).convert("RGBA")
    katalog = KATALOG_APLIKACJI / "src" / "app"

    kwadrat(logo, 512).save(katalog / "icon.png")
    kwadrat(logo, 180).save(katalog / "apple-icon.png")
    # ICO z kilkoma rozmiarami: przeglądarki wybierają najbliższy, a Windows
    # i skróty na pulpicie sięgają po większe.
    kwadrat(logo, 256).save(
        katalog / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    print(f"Ikony odtworzone z {zrodlo}:")
    for nazwa in ("icon.png", "apple-icon.png", "favicon.ico"):
        plik = katalog / nazwa
        print(f"  {nazwa}: {plik.stat().st_size // 1024} kB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
