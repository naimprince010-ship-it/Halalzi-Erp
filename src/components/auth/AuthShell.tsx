import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-brand">
        <Link href="/" className="brand-mark" aria-label="Halalzi ERP home">
          HE
        </Link>
        <div>
          <p className="eyebrow">Halalzi ERP</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </section>
      <section className="auth-panel">
        {children}
        <div className="auth-footer">{footer}</div>
      </section>
    </main>
  );
}
