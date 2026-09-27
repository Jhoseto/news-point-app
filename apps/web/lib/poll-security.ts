import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const POLL_COOKIE = "np_poll_voter";
export function pollHash(secret: string, purpose: string, value: string) {
  return createHmac("sha256", secret).update(`newspoint:polls:v1:${purpose}:${value}`).digest("hex");
}
export function signVoter(secret: string, now = Date.now()) {
  const value = `${randomBytes(24).toString("hex")}.${Math.floor(now / 1000)}`;
  return `${value}.${pollHash(secret, "cookie", value)}`;
}
export function verifyVoter(secret: string, cookie: string | undefined, now = Date.now()) {
  if (!cookie || !/^[a-f0-9]{48}\.\d{10}\.[a-f0-9]{64}$/.test(cookie)) return null;
  const [id, time, signature] = cookie.split(".");
  const age = Math.floor(now / 1000) - Number(time);
  if (age < -60 || age > 366 * 86400) return null;
  const expected = pollHash(secret, "cookie", `${id}.${time}`);
  return timingSafeEqual(Buffer.from(signature!, "hex"), Buffer.from(expected, "hex")) ? id! : null;
}
export function normalizePollIp(raw: string | null) {
  if (!raw || raw.includes(",") || raw.length > 64 || raw.includes("%")) return null;
  const value = raw.trim();
  const version = isIP(value);
  if (!version) return null;
  if (version === 4) return value;
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1,-1);
  if (canonical.startsWith("::ffff:")) {
    const tail = canonical.slice(7).split(":");
    if (tail.length === 2) { const a = parseInt(tail[0]!,16), b = parseInt(tail[1]!,16); return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`; }
  }
  return canonical;
}
