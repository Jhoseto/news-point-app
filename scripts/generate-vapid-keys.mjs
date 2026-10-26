// Generate one stable Web Push key pair in the existing private .env.local.
// A launch timestamp prevents replaying queued jobs and using old subscriptions.
//   node scripts/generate-vapid-keys.mjs
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { open, readFile, rename, stat, unlink } from "node:fs/promises";

const root = resolve(import.meta.dirname, "..");
const webpush = createRequire(resolve(root, "apps/web/package.json"))("web-push");
const envPath = resolve(root, ".env.local");

const info = await stat(envPath);
if (!info.isFile() || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) {
  throw new Error("Existing .env.local must be a private regular file.");
}
const original = await readFile(envPath, "utf8");
if (/^(VAPID_(PUBLIC_KEY|PRIVATE_KEY|SUBJECT)|PUSH_LAUNCH_AT)=/m.test(original)) {
  throw new Error("Push configuration already exists; refusing to replace the key pair.");
}
const subject = process.env.VAPID_SUBJECT ?? "https://newspoint.bg";
const contact = new URL(subject);
if (contact.protocol !== "https:" || contact.username || contact.password || contact.search || contact.hash) {
  throw new Error("VAPID_SUBJECT must be a public HTTPS URL.");
}
const keys = webpush.generateVAPIDKeys();
const launchAt = new Date().toISOString();
const block = [
  "",
  "# Web Push: stable key pair and first delivery boundary",
  `VAPID_SUBJECT=${subject}`,
  `VAPID_PUBLIC_KEY=${keys.publicKey}`,
  `VAPID_PRIVATE_KEY=${keys.privateKey}`,
  `PUSH_LAUNCH_AT=${launchAt}`,
  "",
].join("\n");
const temp = `${envPath}.vapid-${process.pid}`;
let handle;
try {
  handle = await open(temp, "wx", 0o600);
  await handle.writeFile(original.replace(/\s*$/, "") + block, "utf8");
  await handle.sync();
  await handle.close();
  handle = undefined;
  const current = await readFile(envPath);
  if (createHash("sha256").update(current).digest("hex") !== createHash("sha256").update(original).digest("hex")) {
    throw new Error(".env.local changed while generating keys.");
  }
  await rename(temp, envPath);
} catch (error) {
  await handle?.close();
  await unlink(temp).catch(() => {});
  throw error;
}
console.log("New VAPID key pair and launch timestamp saved privately in .env.local.");
