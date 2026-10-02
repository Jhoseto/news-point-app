import { describe, expect, it } from "vitest";
import { countUsers, filterUsers, initialsFrom, ROLE_KEYS, ROLE_TONE, type UserRow } from "./users-manager-utils";

const ADMIN: UserRow = {
  id: "1",
  name: "Петър Георгиев",
  email: "petar@example.com",
  role: "master_admin",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastActiveAt: "2026-10-01T08:30:00.000Z",
  profileBio: "Главен редактор.",
  profileImageUrl: null,
};

const EDITOR_1: UserRow = { ...ADMIN, id: "2", name: "Мария Илиева", email: "maria@example.com", role: "editor", profileBio: "Пловдив" };
const EDITOR_2: UserRow = { ...ADMIN, id: "3", name: "Стоян Стоянов", email: "stoyan@example.com", role: "editor", profileBio: "България" };
const EDITOR_3: UserRow = { ...ADMIN, id: "4", name: "Георги Иванов", email: "georgi@example.com", role: "admin", profileBio: "" };

describe("ROLE_TONE", () => {
  it("maps each role to a deterministic tone", () => {
    expect(ROLE_TONE.editor).toBe("neutral");
    expect(ROLE_TONE.admin).toBe("info");
    expect(ROLE_TONE.master_admin).toBe("positive");
  });
  it("lists the same roles that the keys array holds", () => {
    expect(Object.keys(ROLE_TONE).sort()).toEqual([...ROLE_KEYS].sort());
  });
});

describe("initialsFrom", () => {
  it("returns the first letter of a single-word name", () => {
    expect(initialsFrom("Мария")).toBe("М");
  });
  it("returns the first letter of each word, up to two", () => {
    expect(initialsFrom("Петър Георгиев")).toBe("ПГ");
    expect(initialsFrom("Георги Иванов Петров")).toBe("ГИ");
  });
  it("uppercases latin input", () => {
    expect(initialsFrom("alice cooper")).toBe("AC");
  });
  it("returns an empty string for empty input", () => {
    expect(initialsFrom("")).toBe("");
  });
});

describe("countUsers", () => {
  it("counts every role and the total", () => {
    const counts = countUsers([ADMIN, EDITOR_1, EDITOR_2, EDITOR_3]);
    expect(counts.all).toBe(4);
    expect(counts.editor).toBe(2);
    expect(counts.admin).toBe(1);
    expect(counts.master_admin).toBe(1);
  });

  it("returns zeros for an empty list", () => {
    const counts = countUsers([]);
    expect(counts.all).toBe(0);
    expect(counts.editor).toBe(0);
    expect(counts.admin).toBe(0);
    expect(counts.master_admin).toBe(0);
  });
});

describe("filterUsers", () => {
  it("returns everything when the filter is 'all' and the query is empty", () => {
    expect(filterUsers([ADMIN, EDITOR_1, EDITOR_2, EDITOR_3], "all", "").map((n) => n.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("filters by role", () => {
    expect(filterUsers([ADMIN, EDITOR_1, EDITOR_2, EDITOR_3], "editor", "").map((n) => n.id)).toEqual(["2", "3"]);
    expect(filterUsers([ADMIN, EDITOR_1, EDITOR_2, EDITOR_3], "master_admin", "").map((n) => n.id)).toEqual(["1"]);
  });

  it("searches name, email and bio case-insensitively", () => {
    expect(filterUsers([ADMIN, EDITOR_1, EDITOR_2, EDITOR_3], "all", "мария").map((n) => n.id)).toEqual(["2"]);
    expect(filterUsers([ADMIN, EDITOR_1, EDITOR_2, EDITOR_3], "all", "ПЕТЪР").map((n) => n.id)).toEqual(["1"]);
    expect(filterUsers([ADMIN, EDITOR_1, EDITOR_2, EDITOR_3], "all", "STOYAN@").map((n) => n.id)).toEqual(["3"]);
    expect(filterUsers([ADMIN, EDITOR_1, EDITOR_2, EDITOR_3], "all", "Пловдив").map((n) => n.id)).toEqual(["2"]);
  });

  it("ignores whitespace-only queries", () => {
    expect(filterUsers([ADMIN, EDITOR_1, EDITOR_2, EDITOR_3], "all", "   ").map((n) => n.id)).toEqual(["1", "2", "3", "4"]);
  });
});