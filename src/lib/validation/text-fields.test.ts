import { describe, expect, it } from "vitest";
import { optionalText, text, tooLong } from "./text-fields";

describe("text", () => {
  it("trims the ends and stores line breaks as one character", () => {
    expect(text.parse("  first\r\nsecond\rthird  ")).toBe("first\nsecond\nthird");
  });

  it("keeps the line breaks inside", () => {
    expect(text.parse("a\n\nb")).toBe("a\n\nb");
  });
});

describe("tooLong", () => {
  it("names the limit with a thousands separator", () => {
    expect(tooLong(120)).toBe("Use at most 120 characters.");
    expect(tooLong(10_000)).toBe("Use at most 10,000 characters.");
  });
});

describe("optionalText", () => {
  const field = optionalText(5);

  it("stores an empty or blank field as null", () => {
    expect(field.parse("")).toBeNull();
    expect(field.parse("   \r\n ")).toBeNull();
  });

  it("returns the trimmed text", () => {
    expect(field.parse("  Hello ")).toBe("Hello");
  });

  it("refuses more than the limit, counted after trimming", () => {
    expect(field.parse("  12345  ")).toBe("12345");
    const result = field.safeParse("123456");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Use at most 5 characters.");
  });
});
