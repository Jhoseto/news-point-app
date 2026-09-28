import { expect, it } from "vitest";
import { remoteDiskFromEnv, remoteObjectPath } from "./remote-disk";

const prefixes = ["news/", "users/"];

it("builds a server path only for allowed keys", () => {
  expect(remoteObjectPath("/home/np2/storage", "news/2026/09/a.webp", prefixes)).toBe("/home/np2/storage/news/2026/09/a.webp");
  expect(remoteObjectPath("/home/np2/storage", "users/profiles/id/a.webp", prefixes)).toBe("/home/np2/storage/users/profiles/id/a.webp");
  expect(remoteObjectPath("/home/np2/storage", "news/../etc/passwd", prefixes)).toBeNull();
  expect(remoteObjectPath("/home/np2/storage", "other/a.webp", prefixes)).toBeNull();
  expect(remoteObjectPath("/home/np2/storage", "news/a'.webp", prefixes)).toBeNull();
});

it("enables remote disk only with an ssh key and a posix root", () => {
  expect(remoteDiskFromEnv({ MEDIA_ROOT: "/home/np2/storage", MEDIA_SSH_TARGET: "np2@127.0.0.1", MEDIA_SSH_KEY: "C:/keys/np2" })?.root).toBe("/home/np2/storage");
  expect(remoteDiskFromEnv({ MEDIA_ROOT: "C:/storage", MEDIA_SSH_TARGET: "np2@127.0.0.1", MEDIA_SSH_KEY: "C:/keys/np2" })).toBeNull();
  expect(remoteDiskFromEnv({ MEDIA_ROOT: "/home/np2/storage" })).toBeNull();
});
