// The callback.rs the extension's button links to (features/chrome-extension.md), chosen when it is built:
// the store build points to https://callback.rs, and a development build may point to a local server,
// `CALLBACK_ORIGIN=http://localhost:3103 npm run extension:build`. Nothing else is accepted, so a build can't
// quietly send candidates somewhere else. The origin is compiled into the script; it is not a setting.

export const PRODUCTION_ORIGIN = "https://callback.rs";

const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

// The origin to build with. No value is the production one. An https origin is accepted, with nothing but
// a host after it; http is accepted for a local server only. Throws for anything else.
export function resolveOrigin(value: string | undefined): string {
  if (value === undefined || value === "") return PRODUCTION_ORIGIN;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`CALLBACK_ORIGIN "${value}" is not an address.`);
  }
  const isLocal = url.protocol === "http:" && LOCAL_HOSTS.includes(url.hostname) && url.port !== "";
  const isSecure = url.protocol === "https:" && url.port === "";
  if (!isLocal && !isSecure) {
    throw new Error(`CALLBACK_ORIGIN must be an https address, or http://localhost:<port> for a development build (got "${value}").`);
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`CALLBACK_ORIGIN must be an origin only: no credentials, path, query or fragment (got "${value}").`);
  }
  return url.origin;
}

// The file the store is given: `callback-extension-<version>.zip`.
export function zipFileName(version: string): string {
  return `callback-extension-${version}.zip`;
}
