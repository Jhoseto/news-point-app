import { listRecentMedia } from "@/lib/articles";
import { StoryThemeEditor } from "@/components/story-theme-editor";

export const metadata = { title: "Нова тема" };
export const dynamic = "force-dynamic";

export default async function NewStoryThemePage() {
  const mediaOptions = await listRecentMedia(48);
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Нова тема</h1>
        <p className="mt-1 text-sm text-muted">Създайте нова тема с продължение. След запазване ще можете да добавите статии.</p>
      </header>
      <StoryThemeEditor mode="create" mediaOptions={mediaOptions} />
    </div>
  );
}
