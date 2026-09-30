const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht", ъ: "a", ь: "", ю: "yu", я: "ya",
};

/** Public episode address. The short tail keeps two equal titles apart. */
export function podcastSlug(title: string, unique: string): string {
  const folded = [...title.toLocaleLowerCase("bg")].map((char) => CYRILLIC[char] ?? char).join("");
  const base = folded.normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const tail = unique.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "ep";
  return `${base || "podcast"}-${tail}`.replace(/-+/g, "-").slice(0, 80);
}
