import type { Metadata } from "next";
import { AuthorProfileEditor } from "@/components/author-profile-editor";
import { getOwnAuthorProfile } from "@/lib/author-profile";
import { requireStaff } from "@/lib/session";

export const metadata: Metadata = { title: "Моят профил" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const staff = await requireStaff();
  const profile = await getOwnAuthorProfile(staff.id);
  return <AuthorProfileEditor staff={{ email: staff.email, role: staff.role }} initial={profile ?? { name: staff.name, bio: "", hasPhoto: false }} />;
}
