/* eslint-disable @next/next/no-img-element */
import * as React from "react";

/**
 * Logo important.is — nasze wdrożenie wewnętrzne.
 *
 * Nazwa komponentu i ścieżka pliku celowo pozostają bez zmian (SupercheckLogo),
 * żeby nie ruszać dwudziestu kilku miejsc importu i nie mnożyć konfliktów przy
 * zaciąganiu zmian z upstreamu. Podmieniona jest wyłącznie treść.
 *
 * Źródło grafiki: oryginalny plik marki, 4320x4320 z przezroczystością,
 * przeskalowany do 512 px i zapisany w app/public/important-logo.png.
 * Nie odtwarzamy logo ścieżkami SVG: kształt liter jest autorski, a ręczna
 * rekonstrukcja daje wynik podobny, lecz nie identyczny.
 *
 * Sygnatura zostaje zgodna z oryginałem (React.SVGProps), bo komponent jest
 * wołany na trzy sposoby: z samym className, z width i height (loader), oraz
 * z aria-hidden (branding status page). Wszystkie trzy muszą działać dalej.
 *
 * UWAGA licencyjna: to zmiana brandingu interfejsu na użytek wewnętrzny,
 * dozwolona przez PERMITTED USE licencji Supercheck ("modify", "internal
 * deployment"). Atrybucja autorów, plik LICENSE i nagłówki copyright muszą
 * pozostać nietknięte, wymaga tego RESTRICTIONS punkt 4.
 */
export function SupercheckLogo({
  className,
  width,
  height,
  style,
  ...reszta
}: React.SVGProps<SVGSVGElement>) {
  return (
    <img
      src="/important-logo.png"
      alt="important.is"
      className={className}
      width={width as number | string | undefined}
      height={height as number | string | undefined}
      style={{ objectFit: "contain", ...(style as React.CSSProperties) }}
      aria-hidden={reszta["aria-hidden"]}
    />
  );
}

// Alias zachowany z wersji upstream: cztery ekrany autoryzacji importują logo
// pod nazwą CheckIcon. Bez tego eksportu build pada na TS2305.
export { SupercheckLogo as CheckIcon };
