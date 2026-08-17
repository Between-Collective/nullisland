/**
 * Numbers as text, without asking the machine what country it is in.
 *
 * `toLocaleString` writes 2,025 in one locale and 2.025 in another, and these
 * numbers end up inside generated files — a package README, the written context
 * beside a fixture. A seed has to produce the same bytes on every machine, so
 * the grouping is done here rather than by ICU.
 */

/** 1234567 -> "1,234,567". Always commas, whatever the environment thinks. */
export function group(value: number): string {
  const [whole, fraction] = String(value).split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = sign ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/** Byte counts, written the way a download shelf writes them. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
