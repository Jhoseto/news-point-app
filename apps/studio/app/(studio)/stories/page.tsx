import Link from "next/link";
import { redirect } from "next/navigation";
import { listStoryThemes } from "@/lib/story-themes";
import { StoryThemesDesk } from "@/components/story-themes-desk";
import { withBase } from "@/lib/paths";

export const metadata = { title: "Теми с продължение" };
export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  { value: "all", label: "Всички" },
  { value: "draft", label: "Чернови" },
  { value: "published", label: "Публикувани" },
] as const;

type StatusValue = (typeof STATUS_OPTIONS)[number]["value"];

function parseStatus(raw: string | string[] | undefined): StatusValue {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "draft" || value === "published" || value === "all") return value;
  return "all";
}

export default async function StoryThemesPage({ searchParams }: { searchParams: Promise<{ status?: string | string[]; q?: string | string[] }> }) {
  const params = await searchParams;
  const status = parseStatus(params.status);
  const qRaw = Array.isArray(params.q) ? params.q[0] : params.q;
  const q = (qRaw ?? "").trim();
  if (q) {
    redirect(withBase(`/search-articles?q=${encodeURIComponent(q)}`));
  }
  const themes = await listStoryThemes(status);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Теми с продължение</h1>
          <p className="mt-1 text-sm text-muted">Обединявайте публикувани статии в една редактирана хронология.</p>
        </div>
        <Link
          href="/stories/new"
          className="np-btn np-btn-primary"
        >
          <span aria-hidden="true">+</span>
          <span>Нова тема</span>
        </Link>
      </header>
      <form
        method="GET"
        className="flex flex-wrap items-end gap-2 text-sm"
      >
        <label className="flex flex-col gap-1 text-muted">
          <span className="text-xs font-bold tracking-wide uppercase">Статус</span>
          <select name="status" defaultValue={status} className="np-input w-44">
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="np-btn np-btn-secondary">Приложи</button>
      </form>
      <StoryThemesDesk themes={themes} />
    </div>
  );
}
