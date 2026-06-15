"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { register } from "@/lib/api/auth-client";
import { FormError } from "./FormError";

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    companyName: "",
    password: "",
    confirmPassword: "",
    termsAccepted: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateField(field: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!form.termsAccepted) {
      setError("Please accept the terms to continue.");
      return;
    }

    setLoading(true);

    try {
      await register(form);
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
      setError(err instanceof Error ? err.message : "Could not create workspace. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <FormError message={error} />
      <label className="field">
        <span>Full name</span>
        <input
          value={form.name}
          onChange={(event) => updateField("name", event.target.value)}
          autoComplete="name"
          placeholder="Admin User"
          minLength={2}
          required
        />
      </label>
      <label className="field">
        <span>Work email</span>
        <input
          value={form.email}
          onChange={(event) => updateField("email", event.target.value)}
          type="email"
          autoComplete="email"
          placeholder="admin@example.com"
          required
        />
      </label>
      <label className="field">
        <span>Company name</span>
        <input
          value={form.companyName}
          onChange={(event) => updateField("companyName", event.target.value)}
          placeholder="Example Company"
          minLength={2}
          required
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          value={form.password}
          onChange={(event) => updateField("password", event.target.value)}
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <label className="field">
        <span>Confirm password</span>
        <input
          value={form.confirmPassword}
          onChange={(event) => updateField("confirmPassword", event.target.value)}
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <label className="check-row">
        <input
          checked={form.termsAccepted}
          onChange={(event) => updateField("termsAccepted", event.target.checked)}
          type="checkbox"
        />
        <span>I agree to create this company workspace.</span>
      </label>
      <button className="primary-button" disabled={loading} type="submit">
        {loading ? "Creating workspace..." : "Create workspace"}
      </button>
      <p className="form-note">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}
