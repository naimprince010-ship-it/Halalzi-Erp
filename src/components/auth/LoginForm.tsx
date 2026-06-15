"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api/auth-client";
import { FormError } from "./FormError";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    setLoading(true);

    try {
      await login({ email, password, rememberMe });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setPassword("");
      setError(err instanceof Error ? err.message : "Could not sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <FormError message={error} />
      <label className="field">
        <span>Email</span>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          autoComplete="email"
          placeholder="admin@example.com"
          required
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          required
        />
      </label>
      <label className="check-row">
        <input
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.target.checked)}
          type="checkbox"
        />
        <span>Remember me</span>
      </label>
      <button className="primary-button" disabled={loading} type="submit">
        {loading ? "Signing in..." : "Sign in"}
      </button>
      <p className="form-note">
        New company? <Link href="/register">Create workspace</Link>
      </p>
    </form>
  );
}
