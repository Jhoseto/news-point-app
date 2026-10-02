import { aiPodcastLine, aiPodcastWarning, type AiPodcastLine, type AiPodcastSource } from "@newspoint/content";
import { z } from "zod";

const API = "https://generativelanguage.googleapis.com/v1beta/interactions";
const TEXT_MODEL = "gemini-3.8-flash";
const TTS_MODEL = "gemini-3.8-flash-tts";
const IMAGE_MODEL = "gemini-3.1-flash-image";
const MUSIC_MODEL = "lyria-3.5";

type Interaction = { steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; data?: string; mime_type?: string }> }>; usage?: unknown };

function apiKey() {
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_AI_STUDIO?.trim();
  if (!key) throw new Error("GEMINI_API_KEY or GOOGLE_AI_STUDIO is missing");
  return key;
}

export async function interact(body: Record<string, unknown>): Promise<Interaction> {
  const response = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const result = await response.json().catch(() => null) as Interaction | null;
  if (!response.ok || !result) throw new Error(`Gemini ${String(body.model)}: HTTP ${response.status}`);
  return result;
}

function block(result: Interaction, type: string) {
  return result.steps?.filter((step) => step.type === "model_output").flatMap((step) => step.content ?? []).findLast((item) => item.type === type);
}

function text(result: Interaction) {
  const value = block(result, "text")?.text;
  if (!value) throw new Error("Gemini returned no text");
  return value;
}

function binary(result: Interaction, type: "audio" | "image") {
  const value = block(result, type)?.data;
  if (!value) throw new Error(`Gemini returned no ${type}`);
  return Buffer.from(value, "base64");
}

async function structured<T>(prompt: string, schema: Record<string, unknown>, parse: (value: unknown) => T): Promise<{ value: T; usage: unknown }> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await interact({ model: TEXT_MODEL, input: prompt, response_format: { type: "text", mime_type: "application/json", schema } });
      return { value: parse(JSON.parse(text(response))), usage: response.usage ?? {} };
    } catch (error) { last = error; }
  }
  throw last;
}

const strings = { type: "array", items: { type: "string" } };
const factsSchema = { type: "object", properties: { facts: strings, quotes: strings, uncertainties: strings }, required: ["facts", "quotes", "uncertainties"] };
const factsParser = z.strictObject({ facts: z.array(z.string()).min(1), quotes: z.array(z.string()), uncertainties: z.array(z.string()) });
export type FactPack = z.infer<typeof factsParser>;

export async function factPack(source: AiPodcastSource): Promise<{ value: FactPack; usage: unknown }> {
  return structured(
    `Извлечи само проверими факти от тази публикувана статия. Не използвай външни знания. Не допълвай липсващи подробности. Цитатите трябва да са дословни. Върни непотвърденото отделно.\nЗаглавие: ${source.title}\nТекст:\n${source.text}`,
    factsSchema,
    (value) => factsParser.parse(value),
  );
}

const lineSchema = { type: "object", properties: { speaker: { type: "string", enum: ["alex", "maya"] }, text: { type: "string" }, direction: { type: "string" } }, required: ["speaker", "text", "direction"] };
const storySchema = { type: "object", properties: { label: { type: "string" }, lines: { type: "array", items: lineSchema } }, required: ["label", "lines"] };
const storyParser = z.strictObject({ label: z.string().min(1).max(180), lines: z.array(aiPodcastLine).min(2).max(100) });

export async function storyScript(source: AiPodcastSource, facts: FactPack, words: number, style: string, direction: string, previous = ""): Promise<{ value: z.infer<typeof storyParser>; usage: unknown }> {
  return structured(
    `Напиши разговорен български радиоподкаст между Алекс и Мая. Цел: около ${words} думи за този сюжет; стил: ${style}. Насока: ${direction || "няма"}. ${previous ? `Корекция на редактора: ${previous}.` : ""} Никакви нови факти, цитати, числа или дати извън факт пакета. Перифразирай точно. Кратки естествени въпроси и реакции, различна дължина на репликите, без повтарящи се клишета. Не чети заглавието дословно. Полето direction е кратка инструкция за изговор или празен низ.\nИзточник: ${source.title} (${source.path})\nФакт пакет: ${JSON.stringify(facts)}\nПълен текст за проверка:\n${source.text}`,
    storySchema,
    (value) => storyParser.parse(value),
  );
}

const introParser = z.strictObject({ lines: z.array(aiPodcastLine).min(1).max(8) });
const introSchema = { type: "object", properties: { lines: { type: "array", items: lineSchema } }, required: ["lines"] };
export async function automaticIntro(titles: string[], style: string) {
  return structured(`Напиши кратък естествен увод на български за Алекс и Мая. Без факти извън тези заглавия: ${JSON.stringify(titles)}. Стил: ${style}.`, introSchema, (value) => introParser.parse(value));
}

const metadataParser = z.strictObject({ title: z.string().trim().min(2).max(180), summary: z.string().trim().min(1).max(600) });
const metadataSchema = { type: "object", properties: { title: { type: "string" }, summary: { type: "string" } }, required: ["title", "summary"] };
export async function episodeMetadata(titles: string[], facts: FactPack[]) {
  return structured(`Създай кратко заглавие и резюме на български за NewsPoint подкаст. Само тези заглавия и факти: ${JSON.stringify({ titles, facts })}. Без измислени твърдения.`, metadataSchema, (value) => metadataParser.parse(value));
}

const warningParser = z.strictObject({ warnings: z.array(z.strictObject({ claim: z.string().min(1), reason: z.string().min(1), excerpt: z.string().nullable() })).max(50) });
const warningSchema = { type: "object", properties: { warnings: { type: "array", items: { type: "object", properties: { claim: { type: "string" }, reason: { type: "string" }, excerpt: { type: ["string", "null"] } }, required: ["claim", "reason", "excerpt"] } } }, required: ["warnings"] };
export async function checkStory(source: AiPodcastSource, segmentId: string, lines: AiPodcastLine[]): Promise<{ value: z.infer<typeof aiPodcastWarning>[]; usage: unknown }> {
  const response = await structured(`Сравни ВСЯКО проверимо твърдение в сценария с публикуваната статия. Върни само недоказани или противоречащи твърдения. В excerpt цитирай съответния пасаж от статията или null. Не използвай външни знания.\nСтатия:\n${source.text}\nСценарий:\n${lines.map((line) => line.text).join("\n")}`, warningSchema, (value) => warningParser.parse(value));
  return { value: response.value.warnings.map((warning) => ({ ...warning, segmentId, sourceId: source.id })), usage: response.usage };
}

const spokenParser = z.strictObject({ lines: z.array(z.strictObject({ spoken: z.string().min(1) })).min(1).max(100) });
const spokenSchema = { type: "object", properties: { lines: { type: "array", items: { type: "object", properties: { spoken: { type: "string" } }, required: ["spoken"] } } }, required: ["lines"] };
const allowedTag = /<(?:breath|sigh|laugh|chuckle|phew|short pause|long pause|throat-clearing)>/g;

export async function directPerformance(lines: AiPodcastLine[]): Promise<{ lines: AiPodcastLine[]; usage: unknown }> {
  const words = lines.reduce((sum, line) => sum + line.text.split(/\s+/).length, 0);
  const budget = Math.max(1, Math.ceil(words / 130));
  const response = await structured(
    `Подготви точния български сценарий за TTS. Запази всички думи и реда на репликите дословно. Не добавяй и не премахвай думи. Добави общо най-много ${budget} вокални маркера от: <breath>, <sigh>, <laugh>, <chuckle>, <phew>, <short pause>, <long pause>, <throat-clearing>. Не поставяй маркер на всяка реплика. Върни точно ${lines.length} елемента, само поле spoken. Насоките са за интонация, не са за произнасяне.\n${JSON.stringify(lines.map(({ speaker, text, direction }) => ({ speaker, text, direction })))}`,
    spokenSchema,
    (value) => spokenParser.parse(value),
  );
  if (response.value.lines.length !== lines.length) throw new Error("Performance director changed turn count");
  let tags = 0;
  const result = lines.map((line, index) => {
    const spoken = response.value.lines[index]!.spoken;
    tags += [...spoken.matchAll(allowedTag)].length;
    const plain = spoken.replace(allowedTag, "").replace(/\s+/g, " ").trim();
    if (plain !== line.text.replace(/\s+/g, " ").trim() || /<[^>]+>/.test(plain)) throw new Error("Performance director changed spoken words");
    return { ...line, spoken };
  });
  if (tags > budget) throw new Error("Performance director exceeded vocal tag budget");
  return { lines: result, usage: response.usage };
}

export async function synthesize(lines: AiPodcastLine[], voices: { alex: string; maya: string }): Promise<{ bytes: Buffer; usage: unknown }> {
  const input = [{ type: "user_input", content: lines.map((line) => ({ type: "text", text: line.spoken || line.text, annotations: [{ type: "speech_metadata", speaker: line.speaker === "alex" ? "Alex" : "Maya", style: line.direction || "natural Bulgarian news conversation" }] })) }];
  const response = await interact({ model: TTS_MODEL, input, response_format: { type: "audio" }, generation_config: { speech_config: { mode: "conversational", speakers: [{ speaker: "Alex", voice: voices.alex }, { speaker: "Maya", voice: voices.maya }] } } });
  const bytes = binary(response, "audio");
  if (bytes.toString("ascii", 0, 4) !== "RIFF") throw new Error("Gemini TTS did not return WAV");
  return { bytes, usage: response.usage ?? {} };
}

export async function generateMusic(prompt: string): Promise<{ bytes: Buffer; usage: unknown }> {
  const response = await interact({ model: MUSIC_MODEL, input: `Instrumental only, no vocals or speech. Original, clean radio news podcast music. ${prompt}`, response_format: { type: "audio" } });
  const bytes = binary(response, "audio");
  if (bytes.length < 1000 || (bytes.toString("ascii", 0, 3) !== "ID3" && !(bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0))) throw new Error("Lyria did not return MP3 music");
  return { bytes, usage: response.usage ?? {} };
}

export async function generateImage(titles: string[]): Promise<{ bytes: Buffer; usage: unknown }> {
  const response = await interact({ model: IMAGE_MODEL, input: [{ type: "text", text: `Create an original editorial podcast cover BACKGROUND inspired by these news topics: ${titles.join("; ")}. Deep navy, electric blue and subtle magenta, sophisticated broadcast aesthetic, no people or recognizable real persons, absolutely no text, letters, logos or typography. Leave central area readable for our deterministic title overlay.` }], response_format: { type: "image", mime_type: "image/png", aspect_ratio: "1:1", image_size: "1K" } });
  return { bytes: binary(response, "image"), usage: response.usage ?? {} };
}
