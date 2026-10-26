import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export type ProcedureDocument = { hash: string; title: string; pages: number; text: string };
export function transcribePdfFragments(items: { str: string; hasEOL: boolean }[]): string {
  return items.map(item => item.str + (item.hasEOL ? "\n" : "")).join("").replace(/[^\S\n]+/gu, " ").trim();
}

/** Keep the exact PDF separately from the searchable transcription. Never execute PDF actions. */
export async function archiveProcedurePdf(bytes: Uint8Array, title: string, outputDir: string): Promise<ProcedureDocument> {
  if (bytes.length > 4_000_000 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("procedure: invalid PDF body");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, disableFontFace: true });
  try {
    const pdf = await loading.promise;
    if (pdf.numPages < 1 || pdf.numPages > 80) throw new Error("procedure: PDF page budget exceeded");
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      // PDF.js emits whitespace items itself. Adding a space per font fragment splits Bulgarian words.
      const text = transcribePdfFragments(content.items.flatMap(item => "str" in item ? [item] : []));
      if (text.length < 20) throw new Error("procedure: scanned or unreadable PDF page");
      pages.push(text); page.cleanup();
    }
    const text = pages.join("\n\n");
    if (text.length < 100 || text.length > 400_000 || text.includes("\uFFFD")) throw new Error("procedure: incomplete PDF transcription");
    await mkdir(resolve(outputDir, "documents"), { recursive: true });
    await writeFile(resolve(outputDir, "documents", `${hash}.pdf`), bytes, { flag: "wx" }).catch(error => { if (error.code !== "EEXIST") throw error; });
    return { hash, title, pages: pdf.numPages, text };
  } finally { await loading.destroy(); }
}

export function competitionSections(raw: string): Record<string, string> {
  const text = raw.replace(/\s+/gu, " ").trim();
  const stages = text.match(/Конкурсната процедура се провежда\s+на\s+три етапа\s*:\s*([\s\S]+?)\s*[ІIVХX]+\.\s*Изисквания към кандидатите/iu)?.[1];
  const requirements = text.match(/Изисквания към кандидатите\s*:\s*([\s\S]+?)\s*[ІIVХX]+\.\s*Необходими документи/iu)?.[1];
  const documents = text.match(/Необходими документи за участие в конкурса\s*:\s*([\s\S]+?)(?=Документите за участие в конкурс)/iu)?.[1];
  const submission = text.match(/Документите за участие в конкурс[\s\S]+/iu)?.[0];
  if (!stages || !requirements || !documents || !submission || !/3\.\s*провеждане/iu.test(stages)
    || !/10\.\s*да/iu.test(requirements) || !/6\.\s*/u.test(documents)) throw new Error("procedure: competition conditions incomplete");
  return { stages, requirements, requiredDocuments: documents, submission };
}

/** This specific table layout has two currency cells: rent excluding VAT, deposit including VAT. */
export function auctionConditions(raw: string): Record<string, string> {
  const text = raw.replace(/\s+/gu, " ").trim();
  const table = text.match(/Начален минимален размер на наема без вкл\. ДДС Размер на депозит за участие в търга с вкл\. ДДС ([\s\S]+?) 1\.\s*Внасяне на депозит/iu)?.[1];
  const amounts = table ? [...table.matchAll(/(\d+(?:[.,]\d{2})?)\s*€\s*\([^)]*\)/gu)] : [];
  const fee = text.match(/Цената на тръжните книжа е\s*(\d+(?:[.,]\d{2})?)\s*€\s*\([^)]*\)\s*с вкл\. ДДС/iu)?.[1];
  const conditions = text.match(/1\.\s*Внасяне на депозит[\s\S]+/iu)?.[0];
  // Preserve the full notice even when another table layout cannot be labelled reliably.
  if (!table || amounts.length !== 2 || !fee || !conditions) return {};
  return { startingRent: amounts[0]![1]!, participationDeposit: amounts[1]![1]!, documentFee: fee, auctionConditions: conditions };
}
