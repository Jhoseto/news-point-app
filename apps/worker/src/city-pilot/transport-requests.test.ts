import { afterEach, expect, it, vi } from "vitest";
import { runPilotSource } from "./run";
import { pilotSources } from "./catalog";

afterEach(() => vi.unstubAllGlobals());
it.each(["/tickets/123", "/control/", "/data.php", "/bus/plovdiv-sofia?ticket=1", "https://user:pass@karat-s.com/bus/plovdiv-sofia", "https://karat-s.com:444/bus/plovdiv-sofia"])("does not request an unapproved Karat redirect: %s", async location => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
  vi.stubGlobal("fetch", fetchMock);
  const result = await runPilotSource(pilotSources.find(source => source.id === "karat-plovdiv-sofia")!, { failures: 0, items: {} });
  expect(result.journal.outcome).toBe("failed");
  expect(result.journal.error).toBe("transport request left the approved public source paths");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("keeps a municipal redirect inside the approved index or PDF paths", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "/wp-admin/" } }));
  vi.stubGlobal("fetch", fetchMock);
  const result = await runPilotSource(pilotSources.find(source => source.id === "plovdiv-transit-documents")!, { failures: 0, items: {} });
  expect(result.journal.outcome).toBe("failed");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
