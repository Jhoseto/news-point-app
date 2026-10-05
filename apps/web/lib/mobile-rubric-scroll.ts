export type FeedPosition = { y: number; anchor?: string; offset?: number; focus?: string; carousels?: number[]; at: number };
const STORAGE_KEY = "np-mobile-rubric-positions:v1";
export class MobileFeedPositions {
  private values = new Map<string, FeedPosition>();
  constructor(private storage?: Pick<Storage, "getItem" | "setItem">) {
    try {
      const input: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null");
      if (!Array.isArray(input)) return;
      for (const pair of input.slice(-32)) {
        if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || !pair[0].startsWith("/") || pair[0].length > 1600) continue;
        const value = pair[1];
        if (!value || !Number.isFinite(value.y) || value.y < 0 || !Number.isFinite(value.at) || Date.now() - value.at > 86_400_000) continue;
        this.values.set(pair[0], { y: value.y, at: value.at,
          ...(typeof value.anchor === "string" && value.anchor.length <= 120 ? { anchor: value.anchor } : {}),
          ...(Number.isFinite(value.offset) && Math.abs(value.offset) < 20_000 ? { offset: value.offset } : {}),
          ...(typeof value.focus === "string" && value.focus.length <= 1200 ? { focus: value.focus } : {}),
          ...(Array.isArray(value.carousels) && value.carousels.length <= 8 && value.carousels.every((n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0) ? { carousels: value.carousels } : {}),
        });
      }
    } catch { /* Storage is optional. */ }
  }
  get(key: string) { return this.values.get(key); }
  save(key: string, value: FeedPosition) {
    this.values.delete(key); this.values.set(key, value);
    while (this.values.size > 32) this.values.delete(this.values.keys().next().value!);
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify([...this.values])); } catch { /* Session memory still works. */ }
  }
}
