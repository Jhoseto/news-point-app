/** One refresh at the placement boundary, or when a suspended tab becomes visible. */
export function createPlacementRefresh(at: number, refresh: () => void, hidden: () => boolean, now = Date.now) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fired = false;
  let cancelled = false;
  const check = () => {
    clearTimeout(timer);
    if (cancelled || fired || !Number.isFinite(at)) return;
    const remaining = at - now();
    if (remaining > 0) {
      timer = setTimeout(check, Math.min(remaining, 2_147_483_647));
    } else if (!hidden()) {
      fired = true;
      refresh();
    }
  };
  check();
  return { check, cancel: () => { cancelled = true; clearTimeout(timer); } };
}
