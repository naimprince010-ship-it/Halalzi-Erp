"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormError } from "./FormError";

type PasswordResetConfirmResponse = {
  ok?: boolean;
  message?: string;
  error?: {
    message?: string;
  };
};

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!token || !password || !confirmPassword) {
      setError("Reset token and new password are required.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const body = (await response.json()) as PasswordResetConfirmResponse;

      if (!response.ok) {
        throw new Error(body.error?.message ?? "Could not reset password.");
      }

      setPassword("");
      setConfirmPassword("");
      setMessage(body.message ?? "Password reset complete.");
      setTimeout(() => router.replace("/login"), 1200);
    } catch (err) {
      setPassword("");
      setConfirmPassword("");
      setError(err instanceof Error ? err.message : "Could not reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <FormError message={error} />
      {message ? <p className="form-success">{message}</p> : null}
      <label className="field">
        <span>Reset token</span>
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="one-time-code"
          placeholder="Paste reset token"
          required
        />
      </label>
      <label className="field">
        <span>New password</span>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <label className="field">
        <span>Confirm new password</span>
        <input
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <button className="primary-button" disabled={loading} type="submit">
        {loading ? "Resetting..." : "Reset password"}
      </button>
      <p className="form-note">
        Already reset? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}
