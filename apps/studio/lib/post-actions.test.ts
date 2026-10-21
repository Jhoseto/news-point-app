import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ staff: vi.fn(), persist: vi.fn(), profile: vi.fn(), photo: vi.fn(), role: vi.fn(), remove: vi.fn(), rename: vi.fn(), update: vi.fn(), set: vi.fn(), where: vi.fn(), returning: vi.fn() }));
vi.unmock("./audit");
vi.mock("./session", () => ({ staffFromRequest: mocks.staff }));
vi.mock("./auth", () => ({ studioOrigins: () => ({ trusted: ["https://newspoint.bg"] }) }));
vi.mock("./audit-store", () => ({ persistAudit: mocks.persist }));
vi.mock("./audit-snapshots", () => ({ snapshotLabel: () => "", auditSnapshot: vi.fn().mockResolvedValue(null), auditArticleLabels: vi.fn().mockResolvedValue({}) }));
vi.mock("@newspoint/db", async original => ({ ...await original<typeof import("@newspoint/db")>(), getDb: () => ({ update: mocks.update }) }));
vi.mock("./author-profile", async original => ({ ...await original<typeof import("./author-profile")>(), saveOwnAuthorProfile: mocks.profile }));
vi.mock("./users", async original => ({ ...await original<typeof import("./users")>(), changeRole: mocks.role, deleteUser: mocks.remove }));
vi.mock("./profile-photo", () => ({ deleteProfilePhoto: mocks.photo }));
vi.mock("./media-library", () => ({ renameMediaAsset: mocks.rename }));
import { POST as profile } from "../app/api/profile/route";
import { POST as role } from "../app/api/staff/[id]/route";
import { POST as remove } from "../app/api/staff/[id]/delete/route";
import { POST as photo } from "../app/api/profile/photo/delete/route";
import { POST as rename } from "../app/api/editor/media/[id]/route";
import { POST as submission } from "../app/api/editor/submissions/route";
import { EditorError } from "./articles";
const id = "360a3346-fae0-43c2-991a-dc73728ca9c9";
const actor = { id: "qa-staff", role: "master_admin", name: "QA", email: "qa@example.test" };
const cases = [
 { name: "profile", path: "/profile/", body: { name: "QA Editor", bio: "" }, call: (r: Request) => profile(r), action: "profile.edit", write: mocks.profile },
 { name: "role", path: `/staff/${id}/`, body: { role: "editor" }, call: (r: Request) => role(r, { params: Promise.resolve({ id }) }), action: "users.edit", write: mocks.role },
 { name: "staff deletion", path: `/staff/${id}/delete/`, body: {}, call: (r: Request) => remove(r, { params: Promise.resolve({ id }) }), action: "users.delete", write: mocks.remove },
 { name: "own photo deletion", path: "/profile/photo/delete/", body: {}, call: (r: Request) => photo(r), action: "profile.deletePhoto", write: mocks.photo },
 { name: "media rename", path: `/editor/media/${id}/`, body: { alt: "Actual photo name" }, call: (r: Request) => rename(r, { params: Promise.resolve({ id }) }), action: "media.rename", write: mocks.rename },
 { name: "submission status and link", path: "/editor/submissions/", body: { id, status: "verified", articleId: null }, call: (r: Request) => submission(r), action: "submissions.edit", write: mocks.update },
];
const request = (path: string, body: unknown, origin = "https://newspoint.bg") => new Request(`https://newspoint.bg/admin/api${path}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
 vi.clearAllMocks(); mocks.staff.mockResolvedValue(actor); mocks.persist.mockResolvedValue(true);
 for (const fn of [mocks.profile,mocks.photo,mocks.role,mocks.remove,mocks.rename]) fn.mockResolvedValue({ id });
 mocks.update.mockReturnValue({ set: mocks.set }); mocks.set.mockReturnValue({ where: mocks.where }); mocks.where.mockReturnValue({ returning: mocks.returning }); mocks.returning.mockResolvedValue([{ id }]);
});
describe.each(cases)("POST $name", item => {
 it("rejects foreign origin, missing session and non-editor before domain writes", async () => {
  expect((await item.call(request(item.path,item.body,"https://foreign.test"))).status).toBe(403);
  mocks.staff.mockResolvedValue(null); expect((await item.call(request(item.path,item.body))).status).toBe(401);
  mocks.staff.mockResolvedValue({ ...actor, role: "reader" }); expect((await item.call(request(item.path,item.body))).status).toBe(403);
  expect(item.write).not.toHaveBeenCalled();
 });
 it("fails closed if audit cannot be recorded", async () => {
  mocks.persist.mockResolvedValue(false); expect((await item.call(request(item.path,item.body))).status).toBe(503); expect(item.write).not.toHaveBeenCalled();
 });
 it("uses the existing domain operation and preserves action metadata", async () => {
  const response=await item.call(request(item.path,item.body)); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(item.write).toHaveBeenCalledOnce(); expect(mocks.persist.mock.calls.at(-1)?.[0]).toMatchObject({ action:item.action,method:"POST",outcome:"success",statusCode:200 });
  if (item.write===mocks.rename) expect(item.write).toHaveBeenCalledWith(id,"Actual photo name");
  else if (item.write!==mocks.update) expect(item.write.mock.calls[0]?.[0]).toEqual(actor);
 });
});
it("does not weaken the user-domain refusal of privileged deletion", async () => {
 mocks.remove.mockRejectedValue(new EditorError(403,"forbidden","Only master admin"));
 expect((await remove(request(`/staff/${id}/delete/`,{}),{params:Promise.resolve({id})})).status).toBe(403);
});
it("keeps schemas on the POST aliases and rejects unsafe identifiers", async () => {
 for (const item of cases.filter(c=>!["staff deletion","own photo deletion"].includes(c.name))) expect((await item.call(request(item.path,{ unexpected:true }))).status).toBe(400);
 expect((await photo(request('/profile/photo/delete/',{ unexpected:true }))).status).toBe(400);
 expect((await remove(request('/staff/invalid/delete/',{}),{params:Promise.resolve({id:'invalid/id'})})).status).toBe(404);
 expect(mocks.update).not.toHaveBeenCalled();
});
