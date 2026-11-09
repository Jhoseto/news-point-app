import { xPostUrl } from "./editorial";

type XWidgets = { createTweet: (id: string, element: HTMLElement, options: { dnt: boolean }) => Promise<HTMLElement | undefined> };
type XWindow = Window & { twttr?: { widgets?: XWidgets } };
let widgetPromise: Promise<XWidgets> | null = null;

function loadXWidgets(): Promise<XWidgets> {
  if (widgetPromise) return widgetPromise;
  widgetPromise = new Promise<XWidgets>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://platform.x.com/widgets.js";
    script.async = true;
    script.onload = () => {
      const widgets = (window as XWindow).twttr?.widgets;
      if (widgets?.createTweet) resolve(widgets);
      else reject(new Error("X widget unavailable"));
    };
    script.onerror = () => reject(new Error("X widget unavailable"));
    document.head.appendChild(script);
  }).catch(error => { widgetPromise = null; throw error; });
  return widgetPromise;
}

export async function createXPost(element: HTMLElement, source: string): Promise<boolean> {
  const post = xPostUrl(source);
  if (!post) return false;
  try {
    const widgets = await loadXWidgets();
    if (!element.isConnected) return false;
    const id = post.split("/").at(-1)!;
    return Boolean(await widgets.createTweet(id, element, { dnt: true }));
  } catch { return false; }
}
