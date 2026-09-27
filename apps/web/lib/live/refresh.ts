/** Coalesces events and checks the active page again when the timer fires. */
export function createLiveRefreshScheduler(refresh: () => void, blocked: () => boolean, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  return {
    cancel,
    schedule() {
      cancel();
      if (blocked()) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (!blocked()) refresh();
      }, delayMs);
    },
  };
}
