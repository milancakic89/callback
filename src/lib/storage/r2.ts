// A small client for one Cloudflare R2 bucket (features/document-storage.md), over its S3 API.
// aws4fetch signs plain `fetch` requests, so there is no SDK here. No `server-only`: the seed script
// uses it too, outside Next.
import { AwsClient } from "aws4fetch";

export type DocumentStoreConfig = {
  // The bucket's own endpoint, https://<account-id>.eu.r2.cloudflarestorage.com for the EU
  // jurisdiction. A bucket in a jurisdiction answers only there: the plain endpoint gives 403.
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export type DocumentStore = {
  // Writes the object, replacing one at the same key.
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  // The object's body as a stream, or null when there is no such object.
  get(key: string): Promise<ReadableStream<Uint8Array> | null>;
  // Deletes the object. Deleting one that isn't there is not an error.
  delete(key: string): Promise<void>;
};

// Each path segment encoded, the slashes kept: keys are paths like applications/{id}/cv/cv.pdf.
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function createDocumentStore({ endpoint, accessKeyId, secretAccessKey, bucket }: DocumentStoreConfig): DocumentStore {
  // R2 has a single region, "auto". A few retries on 5xx and 429, not aws4fetch's ten: a person is
  // waiting on every call.
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto", retries: 2, initRetryMs: 100 });
  const base = endpoint.replace(/\/+$/, "");
  const urlOf = (key: string) => `${base}/${encodeURIComponent(bucket)}/${encodeKey(key)}`;

  async function fail(action: string, key: string, response: Response): Promise<never> {
    // R2 explains itself in an XML body; the code in it is enough and never holds the key's secret.
    const detail = (await response.text().catch(() => "")).match(/<Code>([^<]+)<\/Code>/)?.[1] ?? "";
    throw new Error(`R2 ${action} ${key} failed: ${response.status} ${detail}`.trim());
  }

  return {
    async put(key, bytes, contentType) {
      const response = await client.fetch(urlOf(key), {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: bytes as BodyInit,
      });
      if (!response.ok) await fail("put", key, response);
    },

    async get(key) {
      const response = await client.fetch(urlOf(key), { method: "GET" });
      if (response.status === 404) return null;
      if (!response.ok || !response.body) return fail("get", key, response);
      return response.body;
    },

    async delete(key) {
      const response = await client.fetch(urlOf(key), { method: "DELETE" });
      if (!response.ok && response.status !== 404) await fail("delete", key, response);
    },
  };
}
