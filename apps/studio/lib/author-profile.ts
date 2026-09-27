import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { eq } from "@newspoint/db/orm";
import { authorProfiles, getDb, staffUsers } from "@newspoint/db";
import type { Staff } from "./session";

export const authorProfileInput = z.strictObject({
  name: z.string().trim().min(2, "Името е твърде кратко.").max(80).refine((value) => !/[<>\u0000-\u001f\u007f]/u.test(value), "Името съдържа непозволени знаци."),
  bio: z.string().trim().max(1500),
});

export type AuthorProfileInput = z.infer<typeof authorProfileInput>;

export async function getOwnAuthorProfile(staffId: string): Promise<(AuthorProfileInput & { hasPhoto: boolean }) | null> {
  const [profile] = await getDb()
    .select({ name: staffUsers.name, bio: authorProfiles.bio, image: staffUsers.image })
    .from(staffUsers)
    .leftJoin(authorProfiles, eq(authorProfiles.staffUserId, staffUsers.id))
    .where(eq(staffUsers.id, staffId))
    .limit(1);
  return profile ? { name: profile.name, bio: profile.bio ?? "", hasPhoto: Boolean(profile.image) } : null;
}

export async function saveOwnAuthorProfile(staff: Staff, input: AuthorProfileInput): Promise<AuthorProfileInput> {
  const db = getDb();
  const { name, ...privateProfile } = input;
  await db.transaction(async (tx) => {
    await tx.update(staffUsers).set({ name, updatedAt: new Date() }).where(eq(staffUsers.id, staff.id));
    await tx
      .insert(authorProfiles)
      .values({ staffUserId: staff.id, slug: `private-${createHash("sha256").update(staff.id).digest("hex").slice(0, 32)}`, ...privateProfile, isPublic: false })
      .onConflictDoUpdate({
        target: authorProfiles.staffUserId,
        set: { ...privateProfile, isPublic: false, updatedAt: new Date() },
      });
  });
  return input;
}
