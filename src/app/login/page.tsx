import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in to your workspace"
      subtitle="Access your company dashboard, users, roles, and ERP setup."
      footer={
        <>
          Need a new company account? <Link href="/register">Create one</Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
