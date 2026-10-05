import "server-only";
import { publicPushOrigin } from "@newspoint/db/push-domain";

/** Sends belong exclusively to the durable worker; SSE must never send push. */
export function isPushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && publicPushOrigin(process.env.WEB_URL));
}
