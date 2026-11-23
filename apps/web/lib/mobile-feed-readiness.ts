/** The public model can stream before its home tail. Only that model's own
 * canonical wrapper determines readiness; an inert preview must not block it. */
export function mobileFeedPending(main: Pick<ParentNode, "querySelector">): boolean {
  const script = main.querySelector<HTMLScriptElement>("[data-mobile-rubric-model]");
  return !!script?.parentElement?.querySelector("[data-mobile-feed-pending]");
}
