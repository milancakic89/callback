import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "./schemas";

const PASSWORD = "correct horse battery";

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }): string[] {
  return result.success ? [] : (result.error?.issues.map((issue) => issue.message) ?? []);
}

describe("signInSchema", () => {
  it("accepts an email and a password", () => {
    expect(signInSchema.safeParse({ email: "me@example.com", password: "x" }).success).toBe(true);
  });

  it("lowercases the email", () => {
    const parsed = signInSchema.parse({ email: "Me@Example.COM", password: "x" });
    expect(parsed.email).toBe("me@example.com");
  });

  it("asks for a valid email and for a password", () => {
    expect(messages(signInSchema.safeParse({ email: "not-an-email", password: "x" }))).toContain("Enter a valid email");
    expect(messages(signInSchema.safeParse({ email: "me@example.com", password: "" }))).toContain("Enter your password");
  });

  it("refuses a password longer than 72 characters, bcrypt's limit", () => {
    expect(signInSchema.safeParse({ email: "me@example.com", password: "x".repeat(73) }).success).toBe(false);
    expect(signInSchema.safeParse({ email: "me@example.com", password: "x".repeat(72) }).success).toBe(true);
  });
});

describe("signUpSchema", () => {
  const valid = { email: "me@example.com", password: PASSWORD, confirmPassword: PASSWORD };

  it("accepts a matching password of the right length", () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it("needs at least 8 characters", () => {
    const short = { ...valid, password: "1234567", confirmPassword: "1234567" };
    expect(messages(signUpSchema.safeParse(short))).toContain("Password must be at least 8 characters");
    const eight = { ...valid, password: "12345678", confirmPassword: "12345678" };
    expect(signUpSchema.safeParse(eight).success).toBe(true);
  });

  it("refuses a password that is too long", () => {
    const long = "x".repeat(73);
    expect(signUpSchema.safeParse({ ...valid, password: long, confirmPassword: long }).success).toBe(false);
  });

  it("points a mismatch at the confirmation field", () => {
    const result = signUpSchema.safeParse({ ...valid, confirmPassword: "something else" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.message === "Passwords don't match");
      expect(issue?.path).toEqual(["confirmPassword"]);
    }
  });

  it("needs every field", () => {
    expect(signUpSchema.safeParse({ email: "me@example.com" }).success).toBe(false);
    expect(signUpSchema.safeParse({}).success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("takes just an email, normalised", () => {
    expect(forgotPasswordSchema.parse({ email: "Me@Example.com" })).toEqual({ email: "me@example.com" });
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("needs two matching passwords", () => {
    expect(resetPasswordSchema.safeParse({ password: PASSWORD, confirmPassword: PASSWORD }).success).toBe(true);
    expect(messages(resetPasswordSchema.safeParse({ password: PASSWORD, confirmPassword: "different" }))).toContain("Passwords don't match");
  });

  it("applies the same length rules as sign-up", () => {
    expect(resetPasswordSchema.safeParse({ password: "short", confirmPassword: "short" }).success).toBe(false);
  });
});
