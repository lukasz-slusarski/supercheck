/**
 * Pomocnicze liczenie zakresu dat dla wynikow monitora.
 *
 * Funkcja mieszkala wczesniej w route.ts, ale Next.js 16 pozwala eksportowac
 * z pliku trasy wylacznie handlery (GET/POST/...) i kilka zarezerwowanych pol
 * konfiguracyjnych. Kazdy inny eksport wywala build:
 *   "buildMonitorResultsDateRange" is not a valid Route export field.
 * Stad wydzielenie do osobnego modulu, ktory route.ts i testy importuja.
 */

const DATE_FILTER_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_TIMEZONE_OFFSET_MINUTES = 14 * 60;

export type DateRange = {
  start: Date;
  end: Date;
};

export function buildMonitorResultsDateRange(
  dateFilter: string,
  timezoneOffsetMinutes: number | null = null
): DateRange | null {
  if (!DATE_FILTER_PATTERN.test(dateFilter)) {
    return null;
  }

  const [year, month, day] = dateFilter.split("-").map(Number);
  const utcStart = Date.UTC(year, month - 1, day);
  const parsedStart = new Date(utcStart);

  if (
    parsedStart.getUTCFullYear() !== year ||
    parsedStart.getUTCMonth() !== month - 1 ||
    parsedStart.getUTCDate() !== day
  ) {
    return null;
  }

  const offsetMilliseconds = (timezoneOffsetMinutes ?? 0) * 60 * 1000;
  const start = new Date(utcStart + offsetMilliseconds);
  const end = new Date(Date.UTC(year, month - 1, day + 1) + offsetMilliseconds);

  return { start, end };
}
