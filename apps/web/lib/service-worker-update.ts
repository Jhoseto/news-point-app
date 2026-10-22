/** Ignore first claim; retain the update reload for an already controlled page. */
export function controllerUpdateHandler<T>(initial: T | null, current: () => T | null, reload: () => void): () => void {
  let controller = initial;
  let reloading = false;
  return () => {
    const next = current();
    if (!next || next === controller || reloading) return;
    const replacing = controller !== null;
    controller = next;
    if (!replacing) return;
    reloading = true;
    reload();
  };
}
