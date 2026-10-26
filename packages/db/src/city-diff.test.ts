import { describe, expect, it } from "vitest";
import { diffCityRecords, type StoredCityRecord } from "./city-diff";

const record = (key: string, fingerprint: string, state: StoredCityRecord["state"] = "current") => ({ key, fingerprint, fields: { title: key }, state });

describe("city record lifecycle", () => {
  it("versions a first sighting, correction, return and disappearance", () => {
    const before = [record("edited", "old"), record("returned", "old", "missing"), record("gone", "old"), record("same", "old")];
    const current = [record("edited", "new"), record("returned", "old"), record("same", "old"), record("first", "new")];
    const diff = diffCityRecords(before, current);
    expect(diff).toMatchObject({ added: 1, changed: 2, missing: 1, missingKeys: ["gone"] });
    expect(diff.versions.map(({ key, kind }) => [key, kind])).toEqual([
      ["edited", "changed"], ["returned", "returned"], ["first", "first"], ["gone", "missing"],
    ]);
  });

  it("never reports an already missing record again", () => {
    expect(diffCityRecords([record("gone", "old", "missing")], [])).toMatchObject({ missing: 0, versions: [] });
  });

  it("rejects duplicate keys before the database write", () => {
    expect(() => diffCityRecords([], [record("one", "a"), record("one", "b")])).toThrow("Duplicate city record key");
  });
});
