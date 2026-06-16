import { NextRequest, NextResponse } from "next/server";

type RateLimitPolicy = {
  limit: number;
  windowMs: number;
  scope: "auth" | "write";
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

const AUTH_POLICY: RateLimitPolicy = {
  limit: 10,
  windowMs: 60_000,
  scope: "auth",
};

const WRITE_POLICY: RateLimitPolicy = {
  limit: 120,
  windowMs: 60_000,
  scope: "write",
};

const WRITE_METHODS = new Set(["POST", "PATCH", "DELETE"]);

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

function getPolicy(request: NextRequest): RateLimitPolicy | null {
  const { pathname } = request.nextUrl;

  if (pathname === "/api/auth/login" || pathname === "/api/auth/register") {
    return AUTH_POLICY;
  }

  if (pathname.startsWith("/api/") && WRITE_METHODS.has(request.method)) {
    return WRITE_POLICY;
  }

  return null;
}

function cleanupExpiredBuckets(now: number) {
  if (buckets.size < 500) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function rateLimit(request: NextRequest, policy: RateLimitPolicy) {
  const now = Date.now();
  const key = `${policy.scope}:${getClientIp(request)}:${request.nextUrl.pathname}`;
  const existing = buckets.get(key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : {
          count: 0,
          resetAt: now + policy.windowMs,
        };

  bucket.count += 1;
  buckets.set(key, bucket);
  cleanupExpiredBuckets(now);

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  const remaining = Math.max(0, policy.limit - bucket.count);
  const headers = {
    "Retry-After": String(retryAfterSeconds),
    "X-RateLimit-Limit": String(policy.limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000)),
  };

  if (bucket.count > policy.limit) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please wait a moment and try again.",
        },
      },
      {
        status: 429,
        headers,
      },
    );
  }

  return null;
}

export function proxy(request: NextRequest) {
  const policy = getPolicy(request);
  if (!policy) {
    return NextResponse.next();
  }

  const limitedResponse = rateLimit(request, policy);
  if (limitedResponse) {
    return limitedResponse;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
