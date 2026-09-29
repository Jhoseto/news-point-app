import { eq } from "drizzle-orm";
import { menuName } from "@newspoint/content";
import { categories, getDb } from "@newspoint/db";
import { shareCard } from "@/lib/share-card";

const ACCENTS: Record<string, string> = {
  plovdiv: "#1396a3", "regionalni-novini": "#26936e", balgariya: "#5142d5", politika: "#7650c8",
  "kriminalni-novini": "#d57546", "ot-soczialnite-mrezhi": "#b75f9c", "svetovni-novini": "#3b78d1",
  "sportni-novini": "#289b65", tehnologii: "#2794b4", "biznes-novini": "#b58533", zdrave: "#299c82",
  kultura: "#a365c1", lajfstajl: "#ca6999", izbori: "#7566d6",
};

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const [row] = await getDb().select({ name: categories.name, slug: categories.slug }).from(categories).where(eq(categories.id, id)).limit(1);
  if (!row) return new Response(null, { status: 404 });
  const name = menuName(row.slug, row.name);
  const png = await shareCard({ title: name, kicker: "Рубрика", color: ACCENTS[row.slug] || "#5b6cff" });
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=300" } });
}
