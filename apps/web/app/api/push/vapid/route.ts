import { NextResponse } from "next/server";

/**
 * Returns the VAPID public key so the reader service worker can subscribe.
 * Private key never leaves the server. If the env is not set, returns 503 so
 * the client knows push is not configured on this deployment.
 */
export const dynamic = "force-static";

export function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ error: "Push not configured" }, { status: 503 });
  }
  return NextResponse.json({ publicKey }, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}