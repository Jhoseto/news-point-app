import { beforeEach, expect, it, vi } from "vitest";

const { values } = vi.hoisted(() => ({ values: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@newspoint/db", () => ({
  livepointSubmissions: { id: "id" },
  getDb: () => ({ insert: () => ({ values }) }),
}));
import { saveReport, saveMyNews } from "./store";
import { reportSchema, myNewsSchema } from "./schema";

beforeEach(() => {
  values.mockReset();
  values.mockReturnValue({ returning: async () => [{ id: "12345678-1234-1234-1234-123456789012" }] });
});

it("preserves private attachment metadata in both forms without original filenames", async () => {
  const files = [{ bucket: "livepoint-submissions", path: "generated-id/photo.webp", contentType: "image/webp" as const, bytes: 150, width: 20, height: 10 }];
  const report = reportSchema.parse({ kind: "city", place: "Пловдив", position: { lat: 42, lon: 24 }, description: "Автоматична проверка, без реален сигнал.", contact: "qa@example.com", consent: true });
  const news = myNewsSchema.parse({ workingTitle: "Тестов материал", whatHappened: "Автоматична проверка на частните снимки, без реален материал.", whereWhen: "Тест", publishName: "Test", contact: "qa@example.com", rightsAck: true, factsAck: true });
  await saveReport(report, { ipHash: null, userAgent: null }, files);
  await saveMyNews(news, { ipHash: null, userAgent: null }, files);
  for (const call of values.mock.calls) expect(call[0].payload.files).toEqual(files);
});

it("persists validated contact and exact report coordinates in the private JSON payload", async () => {
  const input = reportSchema.parse({ kind: "city", place: "Пловдив", position: { lat: 42.135456789, lon: 24.745345678 }, description: "Тестова информация за проверка на съхранението, без реален запис.", contact: "  ivan@example.com  ", consent: true });
  const result = await saveReport(input, { ipHash: null, userAgent: "unit-test" });
  expect(result.ok).toBe(true);
  expect(values).toHaveBeenCalledWith(expect.objectContaining({
    kind: "report", status: "received", contact: "ivan@example.com",
    payload: expect.objectContaining({ place: "Пловдив", position: { lat: 42.135456789, lon: 24.745345678 }, contact: "ivan@example.com" }),
  }));
});
