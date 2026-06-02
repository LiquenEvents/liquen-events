import { NextRequest, NextResponse } from "next/server";

/**
 * Injects a unique request ID into every API response so the team can
 * correlate browser error messages with Vercel log entries.
 *
 * If the caller already sends an X-Request-ID header (e.g. an uptime monitor),
 * that value is echoed back unchanged. The ID is also forwarded on the incoming
 * request so API route handlers can read it from request.headers.
 */
export function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Request-ID", requestId);
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
