import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { stdin, stdout } from "node:process";
import { openLocalAccess } from "./local-access.mjs";

if (!stdin.isTTY || !stdout.isTTY) throw new Error("Отвори интерактивен терминал за създаване на локален профил.");
let muted = false;
const output = new Writable({ write(chunk, encoding, done) { if (!muted) stdout.write(chunk, encoding); done(); } });
const reader = createInterface({ input: stdin, output, terminal: true });
const access = openLocalAccess();
try {
  const id = (await reader.question("Потребителско име (латиница, цифри, ._-): ")).trim();
  const email = (await reader.question("Имейл на локалния профил: ")).trim();
  stdout.write("Парола (поне 12 знака, скрито въвеждане): ");
  muted = true;
  const password = await reader.question("");
  stdout.write("\nПовтори паролата: ");
  const confirm = await reader.question("");
  stdout.write("\n");
  if (confirm !== password) throw new Error("Двете пароли се различават.");
  await access.addAccount(id, email, password);
  console.log("Профилът е създаден. Администраторът може да му даде роля от Редакция → Достъп.");
} catch (error) {
  console.error(error.code?.startsWith("ERR_SQLITE") ? "Това потребителско име вече се използва." : error.message);
  process.exitCode = 1;
} finally {
  muted = false;
  reader.close();
  access.close();
}
