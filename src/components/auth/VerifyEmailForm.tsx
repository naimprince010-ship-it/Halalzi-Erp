"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormError } from "./FormError";

type VerifyEmailResponse = {
  ok?: boolean;
  message?: string;
  error?: {
    message?: string;
  };
};

export function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!token) {
      setError("Verification token is required.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/email-verification/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json()) as VerifyEmailResponse;

      if (!response.ok) {
        throw new Error(body.error?.message ?? "Could not verify email.");
      }

      setMessage(body.message ?? "Email address verified.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <FormError message={error} />
      {message ? <p className="form-success">{message}</p> : null}
      <label className="field">
        <span>Verification token</span>
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="one-time-code"
          placeholder="Paste verification token"
          required
        />
      </label>
      <button className="primary-button" disabled={loading} type="submit">
        {loading ? "Verifying..." : "Verify email"}
      </button>
      <p className="form-note">
        Done? <Link href="/dashboard">Go to dashboard</Link>
      </p>
    </form>
  );
}
