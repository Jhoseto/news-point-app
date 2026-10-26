/** Node-only configuration validation. Never import this from a client. */
import { createECDH, timingSafeEqual } from "node:crypto";
import { publicPushOrigin } from "./push-domain";

export function readPushConfiguration(env: Record<string, string | undefined> = process.env) {
  const origin = publicPushOrigin(env.WEB_URL);
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!origin || !publicKey || !privateKey) return null;
  try {
    const launchAt = env.PUSH_LAUNCH_AT ? new Date(env.PUSH_LAUNCH_AT) : null;
    if (launchAt && !Number.isFinite(launchAt.getTime())) return null;
    const privateBytes = Buffer.from(privateKey, "base64url");
    const publicBytes = Buffer.from(publicKey, "base64url");
    if (privateBytes.length !== 32 || publicBytes.length !== 65) return null;
    const curve = createECDH("prime256v1");
    curve.setPrivateKey(privateBytes);
    if (!timingSafeEqual(curve.getPublicKey(), publicBytes)) return null;
    const subject = env.VAPID_SUBJECT ?? origin;
    if (!/^mailto:[^\s@]+@[^\s@]+$/.test(subject) && !publicPushOrigin(subject)) return null;
    return { origin, publicKey, privateKey, subject, launchAt };
  } catch { return null; }
}
