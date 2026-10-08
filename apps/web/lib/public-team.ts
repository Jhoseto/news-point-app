// These four names and portraits were supplied explicitly for the public team page.
// They are editorial content, separate from private Studio staff profiles.
export const featuredPeople = [
  {
    id: "team-atanas", name: "Атанас Доминов", role: "Главен редактор",
    bio: "Ръководи редакционната политика и определя основните теми и приоритети на медията. Отговаря за журналистическите стандарти, достоверността на информацията и цялостното развитие на редакционното съдържание.", isPublic: true,
  },
  {
    id: "team-stanimir", name: "Станимир Дикелов", role: "Репортер",
    bio: "Работи там, където се случват новините. Следи актуалните събития, търси различните гледни точки и предава информацията от място бързо, точно и достъпно за читателите.", isPublic: true,
  },
  {
    id: "team-petar", name: "Петър Георгиев", role: "Редактор – разследващ журналист",
    bio: "Следи новините от Пловдив, страната и света и работи за тяхното точно и навременно представяне. Фокусът му е върху ясния новинарски текст, проверената информация и темите с обществено значение.", isPublic: true,
  },
  {
    id: "team-nikolai", name: "Николай Мутавски", role: "Разследващ журналист",
    bio: "Следи темите отвъд официалните версии и търси фактите зад събитията. Работи по разследвания, обществени казуси и истории, които изискват задълбочена проверка и журналистическа последователност.", isPublic: true,
  },
] as const;

function normalizedName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("bg");
}

/** Only the approved public team or an explicitly public, matching staff profile. */
export function publicAuthorAnchor(name: string, profile?: { id: string; name: string } | null): string | undefined {
  const normalized = normalizedName(name);
  const featured = featuredPeople.find((member) => normalizedName(member.name) === normalized);
  if (featured) return featured.id;
  return profile && normalizedName(profile.name) === normalized ? profile.id : undefined;
}
