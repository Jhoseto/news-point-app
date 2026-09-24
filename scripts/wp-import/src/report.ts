import type { Conversion } from "./convert";
import type { ArticleInput, CategoryInput, MediaInput } from "./persist";

export interface ReportArticle {
  article: ArticleInput;
  hero: MediaInput | null;
  conversion: Conversion;
  error: string | null;
}

interface ReportInput {
  dryRun: boolean;
  since: string | null;
  requests: number;
  categories: CategoryInput[];
  articles: ReportArticle[];
  totalInDb: number | null;
}

function count<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of items) result.set(key(item), (result.get(key(item)) ?? 0) + 1);
  return result;
}

export function buildReport(input: ReportInput): string {
  const { articles } = input;
  const byWpId = new Map(input.categories.map((category) => [category.wpId, category]));
  const blocks = articles.flatMap((entry) => entry.conversion.blocks);
  const notes = articles.flatMap((entry) => entry.conversion.notes.map((note) => ({ ...note, path: entry.article.path })));
  const failed = articles.filter((entry) => entry.error);
  const withoutHero = articles.filter((entry) => !entry.hero);

  const lines: string[] = [];
  lines.push("# Отчет от импорта от WordPress", "");
  lines.push(`- Дата: ${new Date().toISOString()}`);
  lines.push(`- Режим: ${input.dryRun ? "dry-run (без запис в базата)" : "запис в dev базата"}${input.since ? `, промени след ${input.since}` : ", preset за началния екран"}`);
  lines.push(`- Заявки към стария сайт: ${input.requests}`);
  lines.push(`- Статии: ${articles.length} (грешки: ${failed.length}, без основна снимка: ${withoutHero.length})`);
  if (input.totalInDb !== null) lines.push(`- Общо статии в базата след импорта: ${input.totalInDb}`);
  lines.push("");

  lines.push("## Статии по рубрики в менюто", "");
  lines.push("| Рубрика | Статии | Със снимка |", "| --- | --- | --- |");
  for (const category of input.categories.filter((item) => item.inMenu).sort((a, b) => (a.menuOrder ?? 0) - (b.menuOrder ?? 0))) {
    const inCategory = articles.filter((entry) => entry.article.categoryWpIds.includes(category.wpId));
    lines.push(`| ${category.name} | ${inCategory.length} | ${inCategory.filter((entry) => entry.hero).length} |`);
  }
  lines.push("");

  lines.push("## Блокове", "");
  lines.push("| Тип | Брой |", "| --- | --- |");
  for (const [type, value] of [...count(blocks, (block) => block.type)].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${type} | ${value} |`);
  }
  const embeds = count(blocks.filter((block) => block.type === "embed"), (block) => (block.type === "embed" ? block.provider : ""));
  if (embeds.size) lines.push("", `Вградени: ${[...embeds].map(([provider, value]) => `${provider} ${value}`).join(", ")}`);
  lines.push("");

  lines.push("## Непреобразувано и премахнато", "");
  if (!notes.length) lines.push("Няма.");
  for (const note of notes) lines.push(`- ${note.kind}: ${note.detail} (${note.path})`);
  lines.push("");

  lines.push("## Грешки", "");
  if (!failed.length) lines.push("Няма.");
  for (const entry of failed) lines.push(`- ${entry.article.path}: ${entry.error}`);
  lines.push("");

  lines.push("## Импортирани статии", "");
  lines.push("| Публикувана (UTC) | Заглавие | Рубрики | Снимка | Блокове |", "| --- | --- | --- | --- | --- |");
  for (const entry of articles) {
    const names = entry.article.categoryWpIds.map((id) => byWpId.get(id)?.name ?? String(id)).join(", ");
    lines.push(
      `| ${entry.article.publishedAt?.toISOString().slice(0, 16).replace("T", " ") ?? "-"} | [${entry.article.title.replace(/\|/g, "/")}](${entry.article.sourceUrl}) | ${names} | ${entry.hero ? "да" : "не"} | ${entry.conversion.blocks.length} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
