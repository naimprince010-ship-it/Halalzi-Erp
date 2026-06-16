"use client";

import { useState } from "react";
import Link from "next/link";
import { FormError } from "./FormError";

type PasswordResetRequestResponse = {
  ok?: boolean;
  message?: string;
  devResetToken?: string;
  error?: {
    message?: string;
  };
};

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [devResetToken, setDevResetToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setDevResetToken(null);

    if (!email) {
      setError("Email is required.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json()) as PasswordResetRequestResponse;

      if (!response.ok) {
        throw new Error(body.error?.message ?? "Could not request password reset.");
      }

      setMessage(body.message ?? "If an active account exists, password reset instructions will be sent.");
      setDevResetToken(body.devResetToken ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request password reset.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <FormError message={error} />
      {message ? <p className="form-success">{message}</p> : null}
      {devResetToken ? (
        <p className="form-note">
          Local dev reset link: <Link href={`/reset-password?token=${devResetToken}`}>Reset password</Link>
        </p>
      ) : null}
      <label className="field">
        <span>Work email</span>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          autoComplete="email"
          placeholder="admin@example.com"
          required
        />
      </label>
      <button className="primary-button" disabled={loading} type="submit">
        {loading ? "Sending..." : "Send reset instructions"}
      </button>
      <p className="form-note">
        Remembered it? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}
