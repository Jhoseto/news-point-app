// One-time script: generate the VAPID key pair for Web Push authentication.
// Run locally and paste the output into .env.local (never commit).
//   node scripts/generate-vapid-keys.mjs
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("# VAPID keys — paste these into .env.local:");
console.log(`VAPID_SUBJECT="mailto:push@newspoint.bg"`);
console.log(`VAPID_PUBLIC_KEY="${keys.publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${keys.privateKey}"`);