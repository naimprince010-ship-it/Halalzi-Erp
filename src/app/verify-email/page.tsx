import { Suspense } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { VerifyEmailForm } from "@/components/auth/VerifyEmailForm";

export default function VerifyEmailPage() {
  return (
    <AuthShell
      title="Verify your email"
      subtitle="Confirm your email address to keep your workspace account trusted."
      footer={
        <>
          Need to sign in? <Link href="/login">Go to login</Link>
        </>
      }
    >
      <Suspense fallback={<p className="form-note">Loading verification form...</p>}>
        <VerifyEmailForm />
      </Suspense>
    </AuthShell>
  );
}
