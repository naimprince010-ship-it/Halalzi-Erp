type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type PasswordResetEmailInput = {
  to: string;
  name: string;
  resetUrl: string;
};

function getAppBaseUrl() {
  const configuredUrl = process.env.APP_BASE_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProductionUrl) {
    return `https://${vercelProductionUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
}

function getEmailFrom() {
  return process.env.EMAIL_FROM?.trim() || "Halalzi ERP <onboarding@resend.dev>";
}

export function buildPasswordResetUrl(token: string) {
  const url = new URL("/reset-password", getAppBaseUrl());
  url.searchParams.set("token", token);
  return url.toString();
}

export async function sendEmail({ to, subject, text, html }: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`Email skipped in development: ${subject} -> ${to}`);
      return { skipped: true };
    }

    throw new Error("RESEND_API_KEY is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: getEmailFrom(),
      to,
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email failed with status ${response.status}: ${body}`);
  }

  return response.json();
}

export function sendPasswordResetEmail({ to, name, resetUrl }: PasswordResetEmailInput) {
  const subject = "Reset your Halalzi ERP password";
  const text = [
    `Hello ${name},`,
    "",
    "We received a request to reset your Halalzi ERP password.",
    `Open this secure link to choose a new password: ${resetUrl}`,
    "",
    "This link expires in 30 minutes. If you did not request this, you can ignore this email.",
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #17202a; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">Reset your Halalzi ERP password</h2>
      <p>Hello ${name},</p>
      <p>We received a request to reset your Halalzi ERP password.</p>
      <p>
        <a href="${resetUrl}" style="display: inline-block; background: #1f5f8b; color: #ffffff; padding: 10px 14px; border-radius: 6px; text-decoration: none;">
          Reset password
        </a>
      </p>
      <p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>
    </div>
  `;

  return sendEmail({ to, subject, text, html });
}
