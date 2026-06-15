import { z } from "zod";
import { validationError } from "./auth-errors";

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
    companyName: z.string().trim().min(2).max(120),
    termsAccepted: z.literal(true),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
  rememberMe: z.boolean().optional().default(false),
});

export function validateRegisterInput(input: unknown) {
  const result = registerSchema.safeParse(input);

  if (!result.success) {
    throw validationError();
  }

  return result.data;
}

export function validateLoginInput(input: unknown) {
  const result = loginSchema.safeParse(input);

  if (!result.success) {
    throw validationError();
  }

  return result.data;
}
