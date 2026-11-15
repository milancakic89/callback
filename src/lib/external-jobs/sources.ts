// The three job sites Callback can track an application from (features/chrome-extension.md). Plain
// module, no imports: the server checks a link with it and the browser extension is built from it, so
// the host a link may name is written in one place.

export const EXTERNAL_SOURCES = ["linkedin", "helloworld", "infostud"] as const;
export type ExternalSource = (typeof EXTERNAL_SOURCES)[number];

// The one host each site's job pages are served from. The extension's manifest names the same three.
export const EXTERNAL_SOURCE_HOSTS: Record<ExternalSource, string> = {
  linkedin: "www.linkedin.com",
  helloworld: "www.helloworld.rs",
  infostud: "poslovi.infostud.com",
};

export const EXTERNAL_SOURCE_LABELS: Record<ExternalSource, string> = {
  linkedin: "LinkedIn",
  helloworld: "HelloWorld",
  infostud: "Infostud",
};

export function isExternalSource(value: unknown): value is ExternalSource {
  return typeof value === "string" && (EXTERNAL_SOURCES as readonly string[]).includes(value);
}

// The site a host belongs to, or null. The match is exact: "linkedin.com.evil.rs" and
// "www.linkedin.com.evil.rs" are not LinkedIn. Never taken from anything but the address itself.
export function externalSourceOfHost(hostname: string): ExternalSource | null {
  const host = hostname.toLowerCase();
  return EXTERNAL_SOURCES.find((source) => EXTERNAL_SOURCE_HOSTS[source] === host) ?? null;
}

// An address that can be one of ours to follow: https only, no credentials, no port, nothing but a
// URL. `new URL` lowercases the host and resolves "..", so what comes back is what a browser would open.
export function parseHttpsUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  return url;
}

// The site a job's address is on, or null for anything else (another host, http:, javascript:, …).
export function externalSourceOf(input: string): ExternalSource | null {
  const url = parseHttpsUrl(input);
  return url ? externalSourceOfHost(url.hostname) : null;
}
