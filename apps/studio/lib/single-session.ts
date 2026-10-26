import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb, staffSessions, staffUsers } from "@newspoint/db";

/** Keep the newest database session for one staff account after Better Auth creates it. */
export async function keepNewestStaffSession(userId: string, createdSessionId: string): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    // Serialize logins for this account across Studio processes and devices.
    const [user] = await tx.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.id, userId)).for("update");
    if (!user) return false;
    const [newest] = await tx.select({ id: staffSessions.id })
      .from(staffSessions)
      .where(eq(staffSessions.userId, userId))
      .orderBy(desc(staffSessions.createdAt), desc(staffSessions.id))
      .limit(1);
    if (!newest) return false;
    await tx.delete(staffSessions).where(and(eq(staffSessions.userId, userId), ne(staffSessions.id, newest.id)));
    // A simultaneous newer login may already have replaced this session.
    return newest.id === createdSessionId;
  });
}
