/** Publication is a separate explicit switch; it never makes hidden records public. */
export function cityGuideEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.CITY_GUIDE_ENABLED === "1";
}
