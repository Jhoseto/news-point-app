import { NextResponse } from "next/server";
import { getMenuCategories } from "@/lib/queries";

/** Public menu rubrics for push preference UI (slug + label only). */
export async function GET() {
  const menu = await getMenuCategories();
  return NextResponse.json(
    { categories: menu.map((item) => ({ slug: item.slug, name: item.name })) },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } },
  );
}
