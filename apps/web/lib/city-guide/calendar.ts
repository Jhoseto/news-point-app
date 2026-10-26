/** A deadline is an all-day reminder, not an appointment or a verified event time. */
export function cityDeadlineCalendar(title: string, deadline: string): string {
  const day = new Date(`${deadline}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(deadline) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== deadline) throw new Error("Invalid deadline");
  const escape = (value: string) => value.replace(/\\/gu, "\\\\").replace(/\r?\n/gu, "\\n").replace(/;/gu, "\\;").replace(/,/gu, "\\,");
  const next = new Date(day.getTime() + 86_400_000).toISOString().slice(0, 10);
  const safeTitle = title.replace(/[\r\n]/gu, " ").slice(0, 300);
  // Fold by UTF-8 bytes so Bulgarian text remains valid in calendar readers.
  const fold = (line: string) => {
    const lines: string[] = []; let current = ""; let bytes = 0;
    for (const char of line) { const size = new TextEncoder().encode(char).length; if (bytes + size > 73) { lines.push(current); current = " "; bytes = 1; } current += char; bytes += size; }
    lines.push(current); return lines.join("\r\n");
  };
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NewsPoint//City Guide//BG", "BEGIN:VEVENT", `UID:deadline-${deadline}-${Array.from(safeTitle).map(char => char.codePointAt(0)!.toString(16)).join("")}@newspoint.bg`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z")}`, `DTSTART;VALUE=DATE:${deadline.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${next.replaceAll("-", "")}`, `SUMMARY:${escape(safeTitle)}`, "DESCRIPTION:Краен срок от Моят Пловдив. Провери за промени преди действие.", "TRANSP:TRANSPARENT", "END:VEVENT", "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}

