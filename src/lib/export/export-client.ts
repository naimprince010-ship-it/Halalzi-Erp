"use client";

/**
 * Client helper to download a CSV export from an authenticated export endpoint.
 *
 * The fetch uses the browser session cookie, so unauthenticated or unauthorized
 * requests are rejected by the server (401/403) and surfaced as an error here.
 */
export async function downloadCsvExport(url: string): Promise<void> {
  const response = await fetch(url, { method: "GET", cache: "no-store" });

  if (!response.ok) {
    let message = "Export failed. Please try again.";

    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      message = payload.error?.message ?? message;
    } catch {
      // Non-JSON error body; keep the default message.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? "export.csv";

  const objectUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
