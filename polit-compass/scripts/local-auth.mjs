import { randomBytes } from "node:crypto";

const cookieName = "compass_preview";
const cookieAttributes = "; HttpOnly; SameSite=Strict; Path=/polit-compass";
const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
function sessionToken(headers) {
  const part = (headers.get("Cookie") || "").split(";").map(x => x.trim()).find(x => x.startsWith(cookieName + "="));
  return part?.slice(cookieName.length + 1);
}

const loginScript = `
const form = document.querySelector("form");
const status = document.querySelector("[role=status]");
async function login(data) {
  status.textContent = "Проверка на достъпа…";
  try {
    const response = await fetch("/polit-compass/local-login/session/", {
      method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error();
    location.replace("/polit-compass/#editor");
  } catch {
    status.textContent = data.ticket ? "Връзката е изтекла или вече е използвана. Изпълни npm run editor:login отново." : "Невалидно потребителско име или парола.";
  }
}
const ticket = location.hash.slice(1);
if (ticket) { history.replaceState(null, "", "/polit-compass/local-login"); login({ticket}); }
form.addEventListener("submit", event => {
  event.preventDefault();
  const values = new FormData(form);
  const password = values.get("password");
  form.elements.password.value = "";
  login({id:values.get("id"), password});
});
`;

function loginPage() {
  const nonce = randomBytes(16).toString("base64");
  const html = `<!doctype html><html lang="bg"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Редакторски вход · Български политически компас</title>
<style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:#101b20;color:#ecece2;font:17px/1.5 system-ui,sans-serif}main{width:min(100% - 2rem,28rem);padding:clamp(1.3rem,5vw,2.4rem);border:1px solid #42514e;border-radius:1rem;background:#17262a}h1{font-size:2rem;line-height:1.12;margin-top:0}label,input,button{display:block;width:100%}label{margin:1rem 0 .35rem}input,button{border-radius:.4rem;font:inherit;padding:.55rem .8rem}input{background:#122024;color:#efede3;border:1px solid #627977}button{margin-top:1.3rem;background:#ffa077;color:#201b18;border:0;font-weight:650;cursor:pointer}a{color:#ffd2ae}code{white-space:nowrap;color:#ffd2ae}p[role=status]{color:#ffd1b4}</style>
<main><h1>Редакторски вход</h1><p>За администраторски вход изпълни <code>npm run editor:login</code> в папката на проекта.</p>
<form><label for="id">Потребителско име</label><input id="id" name="id" autocomplete="username" required maxlength="80">
<label for="password">Парола</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="512">
<button>Влез в редакцията</button></form><p role="status" aria-live="polite"></p><a href="/polit-compass/">Към компаса</a></main>
<script nonce="${nonce}">${loginScript}</script></html>`;
  return new Response(html, { headers: { ...privateHeaders, "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` } });
}

export function createLocalAuth(access) {
  const invalid = (status) => new Response(null, { status, headers: privateHeaders });
  return {
    identity(headers) { return access.identity(sessionToken(headers)); },
    async handle(request) {
      const url = new URL(request.url);
      if (url.pathname === "/local-login/workspace" && request.method === "GET") {
        const challenge = url.searchParams.get("challenge") || "";
        if (!/^[0-9a-f]{64}$/.test(challenge)) return invalid(400);
        return new Response(access.challenge(challenge), { headers: privateHeaders });
      }
      if (url.pathname === "/local-login" && request.method === "GET") return loginPage();
      if (url.pathname === "/local-logout" && request.method === "GET") {
        access.revoke(sessionToken(request.headers));
        return new Response(null, { status: 303, headers: { ...privateHeaders, Location: "/polit-compass/#editor",
          "Set-Cookie": cookieName + "=; Max-Age=0" + cookieAttributes } });
      }
      if (url.pathname !== "/local-login/session") return null;
      if (request.method !== "POST") return invalid(405);
      const headers = request.headers;
      if (headers.get("origin") !== url.origin || headers.get("sec-fetch-site") === "cross-site") return invalid(403);
      if (headers.get("content-type")?.split(";")[0] !== "application/json") return invalid(415);
      if (Number(headers.get("content-length")) > 4096) return invalid(413);
      let text = "";
      const reader = request.body?.getReader();
      if (!reader) return invalid(400);
      const decoder = new TextDecoder();
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) { await reader.cancel(); return invalid(413); }
        text += decoder.decode(value, { stream:true });
      }
      let data;
      try { data = JSON.parse(text + decoder.decode()); } catch { return invalid(400); }
      if (!data || typeof data !== "object") return invalid(400);
      const account = typeof data.ticket === "string" ? access.takeTicket(data.ticket) : await access.verifyAccount(data.id, data.password);
      if (!account) return invalid(401);
      const token = access.newSession(account);
      return new Response(null, { status: 204, headers: { ...privateHeaders,
        "Set-Cookie": cookieName + "=" + token + "; Max-Age=28800" + cookieAttributes } });
    },
  };
}
