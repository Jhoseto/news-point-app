import { spawn } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.tts-voices");
const RELEASE = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2";
const VOICE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/bg/bg_BG/dimitar/medium";

let ready: Promise<PiperPaths> | null = null;

interface PiperPaths {
  binary: string;
  model: string;
  espeak: string;
}

function runtime(): { asset: string; binary: string; dir: string } {
  const key = `${process.platform}-${process.arch}`;
  const known: Record<string, { asset: string; binary: string }> = {
    "win32-x64": { asset: "piper_windows_amd64.zip", binary: "piper.exe" },
    "linux-x64": { asset: "piper_linux_x86_64.tar.gz", binary: "piper" },
    "linux-arm64": { asset: "piper_linux_aarch64.tar.gz", binary: "piper" },
    "darwin-arm64": { asset: "piper_macos_aarch64.tar.gz", binary: "piper" },
    "darwin-x64": { asset: "piper_macos_x64.tar.gz", binary: "piper" },
  };
  const found = known[key];
  if (!found) throw new Error(`Няма Piper за ${key}.`);
  return { ...found, dir: path.join(ROOT, key) };
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function download(url: string, file: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`Не се свали ${url} (${response.status}).`);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
}

async function extract(archive: string, dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const child = spawn("tar", ["-xf", archive, "-C", dir], { windowsHide: true });
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err || `tar ${code}`))));
  });
}

async function ensureDimitar(): Promise<PiperPaths> {
  if (!ready) ready = install().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

async function install(): Promise<PiperPaths> {
  const tool = runtime();
  const binary = path.join(tool.dir, "piper", tool.binary);
  const espeak = path.join(tool.dir, "piper", "espeak-ng-data");
  const model = path.join(ROOT, "bg_BG-dimitar-medium.onnx");
  const modelJson = `${model}.json`;
  if (!(await exists(binary))) {
    const archive = path.join(ROOT, tool.asset);
    if (!(await exists(archive))) await download(`${RELEASE}/${tool.asset}`, archive);
    await extract(archive, tool.dir);
    if (process.platform !== "win32") await chmod(binary, 0o755);
  }
  if (!(await exists(model))) await download(`${VOICE}/bg_BG-dimitar-medium.onnx`, model);
  if (!(await exists(modelJson))) await download(`${VOICE}/bg_BG-dimitar-medium.onnx.json`, modelJson);
  return { binary, model, espeak };
}

/** Speak Bulgarian with the open Dimitar voice. Returns one WAV. */
export async function speakDimitar(text: string): Promise<Uint8Array> {
  const voice = await ensureDimitar();
  const dir = await mkdtemp(path.join(tmpdir(), "np-dimitar-"));
  const wav = path.join(dir, "speech.wav");
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(voice.binary, [
        "--model", voice.model,
        "--espeak_data", voice.espeak,
        "--output_file", wav,
      ], { windowsHide: true });
      let err = "";
      child.stderr.on("data", (chunk: Buffer) => {
        err += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `piper ${code}`))));
      child.stdin.write(text);
      child.stdin.end();
    });
    return await readFile(wav);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
