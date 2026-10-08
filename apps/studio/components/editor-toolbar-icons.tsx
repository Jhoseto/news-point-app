const paths: Record<string, string> = {
  "Добави медия": "M3 3h18v18H3z M3 16l5-5 5 5 3-3 5 5 M16 7h.01",
  Embed: "M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16",
  "Списък": "M9 6h12 M9 12h12 M9 18h12 M3 6h.01 M3 12h.01 M3 18h.01",
  "Номериран списък": "M10 6h11 M10 12h11 M10 18h11 M3 4h1v4 M3 8h2 M3 11c3-1 3 1 0 3h3 M3 17h2l-2 2h2l-2 2",
  "Цитат": "M4 6h6v7H4z M14 6h6v7h-6z M10 13c0 4-2 5-5 5 M20 13c0 4-2 5-5 5",
  "Разделител": "M4 12h16",
  "Връзка": "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  "Вляво": "M4 5h16 M4 10h10 M4 15h16 M4 20h10",
  "Център": "M4 5h16 M7 10h10 M4 15h16 M7 20h10",
  "Вдясно": "M4 5h16 M10 10h10 M4 15h16 M10 20h10",
  "Двустранно": "M4 5h16 M4 10h16 M4 15h16 M4 20h16",
  "Отстъп навътре": "M10 5h11 M10 10h11 M10 15h11 M10 20h11 M3 8l4 4-4 4",
  "Отстъп навън": "M10 5h11 M10 10h11 M10 15h11 M10 20h11 M7 8l-4 4 4 4",
  "Изчисти форматирането": "M8 4h12 M14 4l-4 13 M3 16l6 6 M9 16l-6 6 M14 21h7",
  "Поставяне като чист текст": "M8 4H5v17h14V4h-3 M8 2h8v4H8z M8 10h8 M12 10v7",
  "Отмени": "M8 4l-5 5 5 5 M3 9h11a7 7 0 0 1 0 14",
  "Повтори": "M16 4l5 5-5 5 M21 9H10a7 7 0 0 0 0 14",
  "Премести нагоре": "M12 20V4 M5 11l7-7 7 7",
  "Премести надолу": "M12 4v16 M5 13l7 7 7-7",
  "Дублирай блока": "M8 8h13v13H8z M16 8V3H3v13h5",
  "Премахни блока": "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  "Извади от галерията": "M10 3H3v18h18v-7 M13 3h8v8 M21 3l-11 11",
};

export function EditorToolIcon({ label }: { label: string }) {
  if (label === "Удебелен") return <span className="np-tool-letter np-tool-bold" aria-hidden="true">B</span>;
  if (label === "Курсив") return <span className="np-tool-letter np-tool-italic" aria-hidden="true">I</span>;
  if (label === "Подчертан") return <span className="np-tool-letter np-tool-underline" aria-hidden="true">U</span>;
  if (label === "Зачеркнат") return <span className="np-tool-letter np-tool-strike" aria-hidden="true">S</span>;
  if (label === "Специални символи") return <span className="np-tool-letter" aria-hidden="true">Ω</span>;
  if (label === "Помощ") return <span className="np-tool-letter np-tool-help" aria-hidden="true">?</span>;
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[label]} /></svg>;
}
