import { describe, expect, it } from "vitest";
import { PRODUCTION_ORIGIN, resolveOrigin, zipFileName } from "./origin";

describe("resolveOrigin", () => {
  it("is callback.rs when nothing is given", () => {
    expect(resolveOrigin(undefined)).toBe("https://callback.rs");
    expect(resolveOrigin("")).toBe(PRODUCTION_ORIGIN);
  });

  it("takes an https origin, and writes it as an origin", () => {
    expect(resolveOrigin("https://callback.rs")).toBe("https://callback.rs");
    expect(resolveOrigin("https://callback.rs/")).toBe("https://callback.rs");
    expect(resolveOrigin("HTTPS://Staging.Callback.rs")).toBe("https://staging.callback.rs");
  });

  it("takes a local server over http, for a development build", () => {
    expect(resolveOrigin("http://localhost:3103")).toBe("http://localhost:3103");
    expect(resolveOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  });

  it("refuses http anywhere else, and a local address with no port", () => {
    for (const value of ["http://callback.rs", "http://example.com:3000", "http://localhost", "http://localhost.evil.rs:3000", "http://0.0.0.0:3000"]) {
      expect(() => resolveOrigin(value), value).toThrow("CALLBACK_ORIGIN must be");
    }
  });

  it("refuses other schemes, a port on https, and what isn't an address", () => {
    for (const value of ["javascript:alert(1)", "file:///etc/passwd", "ftp://callback.rs", "https://callback.rs:8443", "callback.rs", "not a url"]) {
      expect(() => resolveOrigin(value), value).toThrow("CALLBACK_ORIGIN");
    }
  });

  it("refuses anything after the origin: credentials, a path, a query or a fragment", () => {
    for (const value of ["https://user:pass@callback.rs", "https://callback.rs/applications", "https://callback.rs/?a=1", "https://callback.rs/#x", "https://callback.rs@evil.rs"]) {
      expect(() => resolveOrigin(value), value).toThrow("CALLBACK_ORIGIN");
    }
  });
});

describe("zipFileName", () => {
  it("names the store's file after the manifest's version", () => {
    expect(zipFileName("0.1.0")).toBe("callback-extension-0.1.0.zip");
  });
});
