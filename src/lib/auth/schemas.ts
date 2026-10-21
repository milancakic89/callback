import { z } from "zod";

const email = z.email("Enter a valid email").trim().toLowerCase();

const newPasswordFields = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  confirmPassword: z.string(),
});

const passwordsMatch = {
  check: (data: z.infer<typeof newPasswordFields>) => data.password === data.confirmPassword,
  params: { message: "Passwords don't match", path: ["confirmPassword"] },
};

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(72),
});

export const signUpSchema = newPasswordFields
  .extend({ email })
  .refine(passwordsMatch.check, passwordsMatch.params);

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = newPasswordFields.refine(
  passwordsMatch.check,
  passwordsMatch.params,
);
