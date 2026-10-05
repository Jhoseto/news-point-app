import { NextResponse } from "next/server";
import { isPushConfigured } from "@/lib/push";

/**
 * Returns the VAPID public key so the reader service worker can subscribe.
 * Private key never leaves the server. If the env is not set, returns 503 so
 * the client knows push is not configured on this deployment.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey || !isPushConfigured()) {
    return NextResponse.json({ error: "Push not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ publicKey }, {
    headers: { "Cache-Control": "no-store" },
  });
}
