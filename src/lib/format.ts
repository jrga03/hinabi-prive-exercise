const RELATIVE_TIME = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: "week", ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: "day", ms: 24 * 60 * 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
];

export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  if (abs < 45_000) return "just now";
  for (const { unit, ms } of UNITS) {
    if (abs >= ms) {
      const value = Math.round(diffMs / ms);
      return RELATIVE_TIME.format(value, unit);
    }
  }
  return RELATIVE_TIME.format(Math.round(diffMs / 1000), "second");
}
