import { createHash } from "node:crypto";

export function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

// Lowercase without diacritics, so ASCII regexes and \b work on Serbian text.
export function plain(value: string): string {
  return value
    .replace(/đ/g, "dj")
    .replace(/Đ/g, "Dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause as { code?: string } | undefined;
    return cause?.code ? `${error.message} (${cause.code})` : error.message;
  }
  return String(error);
}

export function absoluteUrl(href: string | null | undefined, base: string): string | null {
  const value = href?.trim();
  if (!value || value.startsWith("#") || /^(mailto|tel|javascript|data):/i.test(value)) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

const TWO_LEVEL_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "co.rs",
  "org.rs",
  "in.rs",
  "edu.rs",
  "com.au",
  "co.il",
  "com.br",
  "co.za",
  "com.tr",
  "co.jp",
]);

export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  const lastTwo = parts.slice(-2).join(".");
  return TWO_LEVEL_SUFFIXES.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

export function sameSite(a: string, b: string): boolean {
  try {
    return registrableDomain(new URL(a).hostname) === registrableDomain(new URL(b).hostname);
  } catch {
    return false;
  }
}

// "https://www.fivetran.com/" → "fivetran"
export function domainLabel(url: string): string | null {
  try {
    return registrableDomain(new URL(url).hostname).split(".")[0] || null;
  } catch {
    return null;
  }
}

const NAME_NOISE =
  /\b(d o o|doo|a d|ltd|llc|inc|gmbh|ag|srl|bv|plc|corp|corporation|company|group|grupa|holding|international|technologies|technology|tech|solutions|software|services|systems|serbia|srbija|beograd|belgrade|novi sad|nis|europe|development cent(er|re)|dev cent(er|re)|labs?|studio|digital|consulting)\b/g;

// "Levi9 Technology Services Serbia" → "levi9"
export function coreName(name: string): string {
  return cleanText(plain(name).replace(/[^a-z0-9]+/g, " ").replace(NAME_NOISE, " "));
}

export function namesMatch(a: string, b: string): boolean {
  const x = coreName(a);
  const y = coreName(b);
  if (!x || !y) return false;
  if (x === y || x.replace(/ /g, "") === y.replace(/ /g, "")) return true;
  const [firstX] = x.split(" ");
  const [firstY] = y.split(" ");
  return firstX.length >= 4 && firstX === firstY;
}
