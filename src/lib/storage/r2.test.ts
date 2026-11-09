import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDocumentStore } from "./r2";

const fetchMock = vi.fn<(request: Request) => Promise<Response>>();

const store = createDocumentStore({
  endpoint: "https://abc123.eu.r2.cloudflarestorage.com/",
  accessKeyId: "AKIATESTKEY",
  secretAccessKey: "test-secret",
  bucket: "callback-storage-document",
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const lastRequest = () => fetchMock.mock.calls.at(-1)![0];

describe("put", () => {
  it("PUTs the bytes to the bucket's own endpoint, signed, with the content type", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await store.put("applications/app-1/cv/My CV.pdf", new TextEncoder().encode("%PDF-1.7"), "application/pdf");

    const request = lastRequest();
    expect(request.method).toBe("PUT");
    // The trailing slash of the endpoint is dropped, the bucket comes first (path style), and each
    // segment of the key is encoded with the slashes kept.
    expect(request.url).toBe("https://abc123.eu.r2.cloudflarestorage.com/callback-storage-document/applications/app-1/cv/My%20CV.pdf");
    expect(request.headers.get("content-type")).toBe("application/pdf");
    expect(await request.text()).toBe("%PDF-1.7");
    const authorization = request.headers.get("authorization") ?? "";
    expect(authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIATESTKEY\/\d{8}\/auto\/s3\/aws4_request/);
    // The secret never travels.
    expect(authorization).not.toContain("test-secret");
    // Over HTTPS, S3 and R2 take an unsigned payload hash; the headers are signed all the same.
    expect(request.headers.get("x-amz-content-sha256")).toBe("UNSIGNED-PAYLOAD");
    expect(authorization).toContain("SignedHeaders=");
  });

  it("throws, naming the key and R2's error code, when R2 refuses", async () => {
    fetchMock.mockResolvedValue(new Response("<Error><Code>AccessDenied</Code><Message>x</Message></Error>", { status: 403 }));

    await expect(store.put("a/b.pdf", new Uint8Array([1]), "application/pdf")).rejects.toThrow(
      "R2 put a/b.pdf failed: 403 AccessDenied",
    );
  });
});

describe("get", () => {
  it("answers the body as a stream", async () => {
    fetchMock.mockResolvedValue(new Response("%PDF-1.7", { status: 200 }));

    const body = await store.get("mock/ana-novak/cv.pdf");

    expect(lastRequest().method).toBe("GET");
    expect(lastRequest().url).toBe("https://abc123.eu.r2.cloudflarestorage.com/callback-storage-document/mock/ana-novak/cv.pdf");
    expect(await new Response(body).text()).toBe("%PDF-1.7");
  });

  it("answers null for an object that isn't there", async () => {
    fetchMock.mockResolvedValue(new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 }));

    expect(await store.get("missing.pdf")).toBeNull();
  });

  it("throws on any other failure, so a broken bucket isn't mistaken for a missing file", async () => {
    fetchMock.mockResolvedValue(new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 }));

    await expect(store.get("a.pdf")).rejects.toThrow("R2 get a.pdf failed: 403 AccessDenied");
  });

  it("retries a 503 a couple of times, not ten", async () => {
    fetchMock.mockImplementation(async () => new Response("", { status: 503 }));

    await expect(store.get("a.pdf")).rejects.toThrow("failed: 503");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("delete", () => {
  it("sends DELETE, and a missing object is not an error", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await store.delete("a.pdf");
    expect(lastRequest().method).toBe("DELETE");

    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(store.delete("a.pdf")).resolves.toBeUndefined();
  });

  it("throws when R2 refuses", async () => {
    fetchMock.mockResolvedValue(new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 }));

    await expect(store.delete("a.pdf")).rejects.toThrow("R2 delete a.pdf failed: 403 AccessDenied");
  });
});
