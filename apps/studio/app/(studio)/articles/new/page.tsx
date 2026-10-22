import type { Metadata } from "next";
import { ArticleEditor } from "@/components/article-editor";
import { homeHeroReady, listRecentMedia, listSections } from "@/lib/articles";
import { listStoryThemeOptions } from "@/lib/story-themes";
import { requireStaff } from "@/lib/session";
import { listStaffProfiles } from "@/lib/users";
import { getDb } from "@newspoint/db";
import { readSocialStatus } from "@newspoint/db/social-publishing";

export const metadata: Metadata = { title: "Нов материал" };
export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  const staff = await requireStaff();
  const [sections, media, storyThemes, staffProfiles] = await Promise.all([listSections(), listRecentMedia(), listStoryThemeOptions(), listStaffProfiles()]);
  return (
    <ArticleEditor
      socialStatus={await readSocialStatus(getDb())}
      homeHeroReady={await homeHeroReady()}
      staff={{ id: staff.id, name: staff.name }}
      staffProfiles={staffProfiles}
      article={{
        id: null,
        sourceSystem: "studio",
        isPublic: false,
        path: "",
        authorName: staff.name,
        publishedAt: null,
        publishedRevision: null,
        revision: 0,
        revisionSavedAt: null,
        revisionSavedBy: null,
        editableBody: true,
        canEdit: true,
        viewSeedLocked: false,
        viewReal: 0,
        viewAdded: 0,
        listenEnabled: true,
      }}
      draft={{
        title: "",
        slug: "",
        excerpt: "",
        bodyText: "",
        body: [],
        listenEnabled: true,
        primaryCategoryId: null,
        heroMediaId: null,
        heroEmbedUrl: null,
        authorKind: "staff",
        authorUserId: staff.id,
        authorName: staff.name,
        viewSeed: null,
        viewEvery: null,
        viewUnit: "seconds",
        viewTarget: null,
        publishAtSofia: null,
        social: { facebook: { enabled: true, text: "", textMode: "auto" } },
      }}
      sections={sections}
      media={media}
      storyThemes={storyThemes}
      storyThemeId={null}
      webUrl={process.env.WEB_URL ?? "http://localhost:3000"}
    />
  );
}
