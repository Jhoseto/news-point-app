export type TrafficFilter = "all" | "congestion" | "restrictions" | "roadworks" | "other";

const DESCRIPTIONS: Record<string, string> = {
  "stationary traffic": "Спряло движение",
  "queuing traffic": "Колона от автомобили",
  "slow traffic": "Забавено движение",
  closed: "Затворен участък",
  roadworks: "Ремонтни дейности",
};

const PLACE_WORDS: Record<string, string> = {
  ulica: "улица", ulitsa: "улица", bulevard: "булевард", zhk: "жк", shose: "шосе",
  plovdiv: "Пловдив", trakiya: "Тракия", saedinenie: "Съединение", parvenec: "Първенец",
  osvobojdenie: "Освобождение", dimitar: "Димитър", koprivschica: "Копривщица",
  peschersko: "Пещерско", petiofi: "Петьофи", car: "Цар", knyaz: "Княз",
};

const LATIN_TO_CYRILLIC: Record<string, string> = {
  a: "а", b: "б", c: "ц", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и",
  j: "й", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "к",
  r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", y: "й", z: "з",
};

/** Road names may arrive romanized even when the UI language is Bulgarian. */
export function bulgarianTrafficPlace(place: string | null): string | null {
  if (!place) return null;
  return place.replace(/[A-Za-z]+/g, (word) => {
    const lower = word.toLowerCase();
    const known = PLACE_WORDS[lower];
    if (known) return known;
    const transliterated = lower
      .replace(/shch|sch|sht/g, "щ")
      .replace(/zh/g, "ж").replace(/ch/g, "ч").replace(/sh/g, "ш")
      .replace(/ts|tz/g, "ц").replace(/ya/g, "я").replace(/yu/g, "ю")
      .replace(/[a-z]/g, (letter) => LATIN_TO_CYRILLIC[letter] ?? letter);
    return word[0] === word[0]?.toUpperCase()
      ? transliterated[0]?.toUpperCase() + transliterated.slice(1)
      : transliterated;
  });
}

/** TomTom has no Bulgarian Incident Details language; translate only known phrases exactly. */
export function bulgarianIncidentDescription(description: string, categoryLabel: string): string {
  const normalized = description.trim().replace(/[.!]+$/, "").toLowerCase();
  return DESCRIPTIONS[normalized] ?? categoryLabel;
}

export function trafficFilterForCategory(category: number): Exclude<TrafficFilter, "all"> {
  if (category === 6) return "congestion";
  if (category === 7 || category === 8) return "restrictions";
  if (category === 9) return "roadworks";
  return "other";
}
