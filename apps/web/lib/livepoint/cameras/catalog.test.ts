import { describe, expect, it } from "vitest";
import { CAMERA_CATALOG, canPlayInApp, getCamera, getPlayableCameras, hasVerifiedLiveCamera } from "./catalog";
import type { CameraEntry } from "../types";

describe("camera catalog", () => {
  it("keeps unique routes and HTTPS sources for the public catalog", () => {
    expect(new Set(CAMERA_CATALOG.map((camera) => camera.slug)).size).toBe(CAMERA_CATALOG.length);
    for (const camera of CAMERA_CATALOG) {
      expect(new URL(camera.sourceUrl).protocol).toBe("https:");
      if (camera.embedUrl) expect(new URL(camera.embedUrl).protocol).toBe("https:");
      expect(camera.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("does not claim live until a stream is verified", () => {
    expect(hasVerifiedLiveCamera()).toBe(true);
    for (const camera of getPlayableCameras().filter((entry) => entry.streamStatus === "verified")) {
      expect(camera.access).toBe("iframe");
      expect(camera.embedUrl).toBeTruthy();
      expect(camera.embedUrl).not.toMatch(/\.jpe?g(?:\?|$)/i);
    }
  });

  it("offers all three official Pamporovo cameras as distinct in-app players", () => {
    const pamporovo = getPlayableCameras().filter((camera) => camera.group === "pamporovo");
    expect(pamporovo).toHaveLength(3);
    expect(pamporovo.map((camera) => camera.embedUrl).sort()).toEqual([
      "https://webcams.pamporovo.me/e3b8e6e7-406a-4b68-ac23-5cd82fc6437b.html",
      "https://webcams.pamporovo.me/54d2de25-1031-438f-9088-ea70df4702a1.html",
      "https://webcams.pamporovo.me/f2e1a70c-fc32-4e4c-ac6b-a972882efc8d.html",
    ].sort());
    for (const camera of pamporovo) {
      expect(camera.streamStatus).toBe("verified");
      expect(canPlayInApp(camera)).toBe(true);
    }
  });

  it("only exposes available unique feeds while retaining old detail routes", () => {
    const playable = getPlayableCameras();
    expect(playable.length).toBeGreaterThan(0);
    expect(playable.every(canPlayInApp)).toBe(true);
    expect(new Set(playable.map((camera) => camera.embedUrl)).size).toBe(playable.length);
    for (const slug of ["plovdiv-centar-rodopi", "sba-omv-plovdiv", "plovdiv-trakia-rooftop-2"]) {
      expect(getCamera(slug)).toBeDefined();
      expect(playable.some((camera) => camera.slug === slug)).toBe(false);
    }
    const panorama = getCamera("asenovgrad-panorama")!;
    const legacy = getCamera("asenovgrad-ii-86")!;
    expect(legacy.embedUrl).toBe(panorama.embedUrl);
    expect(playable.filter((camera) => camera.embedUrl === panorama.embedUrl)).toHaveLength(1);
    expect(playable).toContain(panorama);
  });

  it.each([
    { access: "link", streamStatus: "verified", embedUrl: "https://example.com/player" },
    { access: "iframe", streamStatus: "unverified", embedUrl: "https://example.com/player" },
    { access: "iframe", streamStatus: "unavailable", embedUrl: "https://example.com/player" },
    { access: "iframe", streamStatus: "verified", embedUrl: null },
    { access: "iframe", streamStatus: "snapshot", embedUrl: "" },
  ] satisfies Array<Pick<CameraEntry, "access" | "streamStatus" | "embedUrl">>)("does not offer an unusable feed: %j", (overrides) => {
    const fixture: CameraEntry = { ...getCamera("pamporovo-webcams")!, ...overrides };
    expect(canPlayInApp(fixture)).toBe(false);
  });

  it("shows refreshing pictures without claiming they are video", () => {
    for (const slug of ["plovdiv-alyosha", "plovdiv-kuklen", "plovdiv-palm-airport", "bansko-gondola", "bansko-todorka", "bansko-banderishka-polyana", "sba-omv-orizovo", "sofia-tsarigradsko-sba"]) {
      const camera = getCamera(slug)!;
      expect(camera.streamStatus).toBe("snapshot");
      expect(canPlayInApp(camera)).toBe(true);
      expect(camera.embedUrl).toMatch(/\.jpg$/);
    }
  });

  it("does not embed stale station photos or the missing SBA Plovdiv feed", () => {
    for (const slug of ["plovdiv-centar-rodopi", "sba-omv-plovdiv"]) {
      const camera = getCamera(slug)!;
      expect(camera.streamStatus).toBe("unavailable");
      expect(canPlayInApp(camera)).toBe(false);
    }
    expect(CAMERA_CATALOG.some((camera) => camera.embedUrl?.includes("photo.html"))).toBe(false);
  });

  it("looks up by slug", () => {
    expect(getCamera("sba-omv-plovdiv")?.owner).toBe("СБА");
    expect(getCamera("missing")).toBeUndefined();
  });
});
