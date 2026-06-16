import { Suspense } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Use your reset token to secure the account with a new password."
      footer={
        <>
          Back to <Link href="/login">sign in</Link>
        </>
      }
    >
      <Suspense fallback={<p className="form-note">Loading reset form...</p>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
