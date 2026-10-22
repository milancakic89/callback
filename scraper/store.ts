import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";

export const DATA_DIR = path.resolve("scraper/data");

export async function readData<T extends z.ZodType>(
  name: string,
  schema: T,
  fallback: z.output<T>,
): Promise<z.output<T>> {
  let text: string;
  try {
    text = await readFile(path.join(DATA_DIR, name), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
  return schema.parse(JSON.parse(text));
}

// Atomic: an interrupted write never leaves a half-written file behind.
export async function writeData(name: string, data: unknown, schema?: z.ZodType): Promise<void> {
  const value = schema ? schema.parse(data) : data;
  await mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, name);
  await writeFile(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  await rename(`${file}.tmp`, file);
}

// Serializes saves so concurrent workers never write the same file at once.
export function createSaver(save: () => Promise<void>): () => Promise<void> {
  let chain = Promise.resolve();
  return () => {
    chain = chain.then(save).catch((error) => console.error("Save failed:", error));
    return chain;
  };
}
