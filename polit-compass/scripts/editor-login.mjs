import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { openLocalAccess } from "./local-access.mjs";

const port = Number(process.env.PORT || "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Невалиден локален порт.");
const address = "http://localhost:" + port + "/polit-compass";
const access = openLocalAccess();
try {
  const challenge = randomBytes(32).toString("hex");
  const verification = await fetch(address + "/local-login/workspace/?challenge=" + challenge, {
    redirect: "error", signal: AbortSignal.timeout(4000),
  }).catch(() => null);
  if (!verification?.ok || await verification.text() !== access.challenge(challenge)) {
    throw new Error("Първо стартирай приложението от същата папка с npm start или npm run dev.");
  }
  const url = address + "/local-login#" + access.issueTicket();
  const command = process.platform === "win32" ? "rundll32.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args, { detached: true, windowsHide: true, stdio: "ignore" });
  await new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error("Системният браузър не се отвори. Провери браузъра по подразбиране и опитай отново.")));
    child.once("spawn", resolve);
  });
  child.unref();
  console.log("Отворен е локалният редакторски вход. Връзката важи за едно влизане в следващите 10 минути.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  access.close();
}
