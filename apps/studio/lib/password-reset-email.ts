const RESET_SUBJECT = "Възстановяване на парола — NewsPoint Studio";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildPasswordResetEmail(url: string) {
  const safeUrl = escapeHtml(url);
  return {
    subject: RESET_SUBJECT,
    text: `Здравейте,\n\nПолучихме заявка за нова парола за NewsPoint Studio.\n\nОтворете връзката (валидна ограничено време):\n${url}\n\nАко не сте заявявали смяна, игнорирайте този имейл.\n`,
    html: `<!doctype html><html lang="bg"><body style="font-family:Manrope,Segoe UI,sans-serif;line-height:1.5;color:#0a1454"><p>Здравейте,</p><p>Получихме заявка за нова парола за <strong>NewsPoint Studio</strong>.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:linear-gradient(135deg,#3818d6,#990fec);color:#fff;font-weight:700;text-decoration:none">Задай нова парола</a></p><p style="font-size:13px;color:#5a6478">Ако бутонът не работи, копирайте:<br><span style="word-break:break-all">${safeUrl}</span></p><p style="font-size:13px;color:#5a6478">Ако не сте заявявали смяна, игнорирайте този имейл.</p></body></html>`,
  };
}
