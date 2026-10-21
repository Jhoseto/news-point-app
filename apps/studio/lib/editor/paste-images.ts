import type { MediaOption } from "../articles";

export type PastedImage = { source: string | File; alt: string };
const MAX_IMAGES = 20;
const allowed = new Set("P DIV SPAN STRONG B EM I U S STRIKE A BR H1 H2 H3 H4 H5 H6 UL OL LI BLOCKQUOTE FIGURE FIGCAPTION IMG".split(" "));
export function hasPastedImages(html: string, files: File[]): boolean { return files.length > 0 || /<img\b/i.test(html); }

/** Detached HTML is never inserted directly: keep editorial markup, replace every image with an owned asset. */
export async function preparePastedImages(html: string, text: string, files: File[], upload: (image: PastedImage) => Promise<MediaOption>) {
  if (html.length > 2_000_000) throw Error("Копираното съдържание е твърде голямо. Поставете го на части.");
  const document = new DOMParser().parseFromString(html || "<div></div>", "text/html");
  document.querySelectorAll("script,style,iframe,object,embed,svg,math,template,link,meta,base,noscript").forEach(node => node.remove());
  const images = Array.from(document.querySelectorAll("img"));
  if (Math.max(images.length, files.length) > MAX_IMAGES) throw Error("Поставяйте до 20 снимки наведнъж.");
  const sources = images.map(image => ({ element: image, source: image.getAttribute("data-src") || image.getAttribute("data-original") || image.getAttribute("src") || "", alt: (image.getAttribute("alt") || "").slice(0,240) }));
  // Discard source classes/styles/events and encoded NewsPoint blocks from foreign HTML.
  for (const element of Array.from(document.body.querySelectorAll("*"))) {
    const href = element.tagName === "A" ? element.getAttribute("href") : null;
    for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
    if (href && /^(https?:\/\/|mailto:)/i.test(href)) element.setAttribute("href",href);
    if (!allowed.has(element.tagName)) element.replaceWith(...Array.from(element.childNodes));
  }
  if (!images.length) {
    document.body.replaceChildren();
    for (const line of text.replace(/\r\n?/g,"\n").split("\n")) { const p=document.createElement("p");p.textContent=line;document.body.append(p); }
    for (const file of files) { const element=document.createElement("img");document.body.append(element);sources.push({element,source:"",alt:file.name.replace(/\.[^.]+$/,"").slice(0,240)}); }
  }
  const cache=new Map<string | File,Promise<MediaOption>>();const items:MediaOption[]=[];let failed=0;
  for (const [index,image] of sources.entries()) {
    // Clipboard file is authoritative for a single copied screenshot/image (blob/file URLs cannot be fetched remotely).
    const source = files.length === sources.length ? files[index]! : image.source;
    try {
      if (!source) throw Error("Missing source");
      let pending=cache.get(source);if(!pending){pending=upload({source,alt:image.alt});cache.set(source,pending);}
      const item=await pending;items.push(item);
      const figure=document.createElement("figure");figure.setAttribute("data-np-image",encodeURIComponent(JSON.stringify({type:"image",mediaAssetId:item.id,size:"large",widthPercent:82,alt:image.alt || item.alt})));
      image.element.replaceWith(figure);
    } catch { failed++;const p=document.createElement("p");p.textContent=`[Снимката не беше добавена${image.alt ? `: ${image.alt}` : ""}]`;image.element.replaceWith(p); }
  }
  return { html:document.body.innerHTML, items, failed };
}
