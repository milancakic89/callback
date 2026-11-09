import { z } from "zod";

// Text as typed into a form: line breaks stored and counted as one character (browsers can submit a
// textarea's as CRLF), and the ends trimmed. Shared by the job form and the company profile form.
export const text = z.string().transform((value) => value.replace(/\r\n?/g, "\n").trim());

export const tooLong = (max: number) => `Use at most ${max.toLocaleString("en-US")} characters.`;

// An optional field: at most `max` characters, and an empty field is stored as null.
export const optionalText = (max: number) =>
  text.pipe(z.string().max(max, tooLong(max))).transform((value) => value || null);
