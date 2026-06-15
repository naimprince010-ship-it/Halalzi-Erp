import Link from "next/link";

export default function Home() {
  return (
    <main className="home-page">
      <section>
        <p className="eyebrow">Halalzi ERP</p>
        <h1>Company operations workspace</h1>
        <p>
          Authentication, tenant context, and RBAC APIs are ready. Create a workspace to
          continue into the protected dashboard.
        </p>
        <div className="home-actions">
          <Link className="primary-button" href="/register">
            Create workspace
          </Link>
          <Link className="secondary-button" href="/login">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
