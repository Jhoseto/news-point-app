// Node-only entry point. Never export from the client-facing barrel.
import { createCipheriv, createDecipheriv, randomBytes, createHmac, timingSafeEqual } from "node:crypto";

function key(): Buffer {
  const encoded = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY ?? "";
  const value = Buffer.from(encoded, "base64");
  if (value.length !== 32 || value.toString("base64") !== encoded) throw new Error("social_key_unavailable");
  return value;
}
export function encryptSocialSecret(value: string, context: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(Buffer.from(context));
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), bytes.toString("base64url")].join(".");
}
export function decryptSocialSecret(value: string, context: string): string {
  try {
    const [version, nonce, tag, bytes, extra] = value.split(".");
    if (version !== "v1" || !nonce || !tag || !bytes || extra) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(nonce, "base64url"));
    decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(bytes, "base64url")), decipher.final()]).toString("utf8");
  } catch { throw new Error("social_secret_unavailable"); }
}
export const pageSecretContext = (pageId: string) => `facebook:${process.env.META_APP_ID ?? ""}:${pageId}`;
export function verifyFacebookSignedRequest(value: string): { userId: string } {
  try {
    const [signature, payload, extra] = value.split(".");
    const secret = process.env.META_APP_SECRET;
    if (!signature || !payload || extra || !secret || value.length > 16000) throw new Error();
    const expected = createHmac("sha256", secret).update(payload).digest(); const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { algorithm?: string; user_id?: string; issued_at?: number };
    const age = Date.now() / 1000 - (data.issued_at ?? NaN);
    if (data.algorithm?.toUpperCase() !== "HMAC-SHA256" || !/^\d+$/.test(data.user_id ?? "") || !Number.isFinite(data.issued_at)
      || age > 86400 || age < -300) throw new Error();
    return { userId: data.user_id! };
  } catch { throw new Error("invalid_signed_request"); }
}
