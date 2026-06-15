export type CurrentUserResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    status: string;
  };
  company: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  roles: string[];
  permissions: string[];
};

export type ApiError = {
  error?: {
    code?: string;
    message?: string;
  };
};

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as ApiError;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Request failed. Please try again.");
  }

  return payload as T;
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  companyName: string;
  termsAccepted: boolean;
}) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });

  return parseResponse<CurrentUserResponse>(response);
}

export async function login(input: { email: string; password: string; rememberMe: boolean }) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });

  return parseResponse<CurrentUserResponse>(response);
}

export async function logout() {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });

  return parseResponse<{ ok: boolean }>(response);
}

export async function getCurrentUser() {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  return parseResponse<CurrentUserResponse>(response);
}
