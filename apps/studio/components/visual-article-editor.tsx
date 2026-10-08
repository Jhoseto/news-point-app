"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Extension, Mark, Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import { EditorContent, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { NodeSelection } from "@tiptap/pm/state";
import { composition, mediaWidth, EMBED_PROVIDER_LABEL, embedFrameUrl, embedAspectRatio, parseEmbedInput, type ArticleBody, type Block } from "@newspoint/content";
import type { MediaOption } from "@/lib/articles";
import { browserMediaSrc } from "@/lib/media-src";
import { bodyToEditorHtml, documentToBody, escapeHtml } from "@/lib/editor/document";
import { mediaInsertionPosition } from "@/lib/editor/selection";
import { EditorDialog } from "./editor-dialog";
import "./visual-article-editor.css";

export interface VisualEditorHandle { insertImages: (items: MediaOption[], gallery?: boolean) => void; }
const COLORS = ["red", "orange", "green", "blue", "purple", "muted", "accent"];
const decodeBlock = (element: HTMLElement, name: string) => { try { return JSON.parse(decodeURIComponent(element.getAttribute(name) ?? "")); } catch { return null; } };
const encodeBlock = (block: unknown) => encodeURIComponent(JSON.stringify(block));

const ColorMark = Mark.create({
  name: "npColor",
  addAttributes: () => ({ color: { default: "accent", parseHTML: element => COLORS.find(color => element.classList.contains(`np-text-${color}`)) ?? "accent" } }),
  parseHTML: () => COLORS.map(color => ({ tag: `span.np-text-${color}` })),
  renderHTML: ({ mark }) => ["span", { class: `np-text-${COLORS.includes(mark.attrs.color) ? mark.attrs.color : "accent"}` }, 0],
});
const TextAttributes = Extension.create({
  name: "npTextAttributes",
  addGlobalAttributes: () => [{
    types: ["paragraph", "heading", "blockquote", "bulletList", "orderedList"],
    attributes: { indent: { default: 0, parseHTML: element => Math.max(0, Math.min(3, Number(element.dataset.indent) || 0)), renderHTML: attrs => ({ "data-indent": attrs.indent, style: `padding-inline-start:${attrs.indent * 1.5}em` }) } },
  }, { types: ["blockquote"], attributes: { cite: { default: "", parseHTML: element => element.dataset.cite ?? "", renderHTML: attrs => ({ "data-cite": attrs.cite }) } } }],
});

function MediaView({ node, selected, updateAttributes, editor, getPos }: NodeViewProps) {
  const block = node.attrs.block as Extract<Block, { type: "image" | "embed" }>;
  const media = (editor.storage as unknown as { npImage: { findMedia: (id: string) => MediaOption | undefined } }).npImage.findMedia;
  const asset = block.type === "image" ? media(block.mediaAssetId) : undefined;
  const frame = block.type === "embed" ? embedFrameUrl(block.url) : null;
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const resize = useRef<{ x: number; width: number; container: number; next: number } | null>(null);
  const layout = composition(block);
  const position = getPos();
  const inGallery = typeof position === "number" && editor.state.doc.resolve(position).parent.type.name === "npGallery";
  const select = () => { const pos = getPos(); if (typeof pos === "number") editor.commands.setNodeSelection(pos); };
  const ratio = block.type === "image" ? ({ square: "1", portrait: "4/5", landscape: "16/9", original: asset?.width && asset?.height ? `${asset.width}/${asset.height}` : undefined }[block.crop ?? "original"]) : embedAspectRatio(block.url);
  return <NodeViewWrapper className={`np-editor-media ${layout.className} ${selected ? "is-selected" : ""}`} style={{ ...layout.style, ...(dragWidth !== null ? { "--np-media-width": `${dragWidth}%` } : {}) }} data-node-kind={block.type}>
    <div className="np-media-heading" contentEditable={false}>
      <span role="button" tabIndex={0} data-drag-handle className="np-media-drag-handle" aria-label="Премести медията" title="Влачете между текстовите блокове" onClick={select} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } }}>⠿</span>
      <button type="button" onClick={select}>{block.type === "image" ? "Снимка · настройки" : "Embed · настройки"}</button>
    </div>
    <div className={`np-media-canvas np-editor-media-canvas ${block.type === "image" ? `shape-${block.shape ?? "rectangle"} frame-${block.frame ?? "none"}` : ""}`} style={{ aspectRatio: block.type === "embed" && !frame ? undefined : ratio }} contentEditable={false} onClick={select}>
      {block.type === "image" ? asset ? <img src={browserMediaSrc(asset.url)} alt={block.alt ?? asset.alt} draggable={false} style={{ objectPosition: `${block.focalX ?? 50}% ${block.focalY ?? 50}%`, transform: `scale(${(block.cropZoom ?? 100) / 100})`, transformOrigin: `${block.focalX ?? 50}% ${block.focalY ?? 50}%` }} /> : <p>Снимката не е достъпна</p>
        : frame ? <iframe referrerPolicy="strict-origin-when-cross-origin" src={frame} title={`Преглед: ${block.provider}`} loading="lazy" allowFullScreen /> : <a className="np-embed-link" href={block.url} target="_blank" rel="noopener noreferrer">Виж публикацията в {EMBED_PROVIDER_LABEL[block.provider]}</a>}
    </div>
    {block.type === "image" && ((block.caption ?? asset?.caption) || asset?.credit) ? <p contentEditable={false} className="np-media-caption">{block.caption ?? asset?.caption}{asset?.credit ? ` · Снимка: ${asset.credit}` : ""}</p> : null}
    {selected && editor.isEditable && !inGallery ? <button type="button" className="np-resize-handle" contentEditable={false} aria-label="Промени ширината с влачене или стрелки" title="Влачене за размер; стрелките променят с 5%"
      onKeyDown={event => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); const width = Math.max(25, Math.min(block.wrap && block.wrap !== "none" ? 50 : 100, mediaWidth(block) + (event.key === "ArrowLeft" ? -5 : 5))); updateAttributes({ block: { ...block, widthPercent: width } }); } }}
      onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const wrapper = event.currentTarget.closest(".np-editor-media") as HTMLElement; const container = (wrapper.parentElement?.getBoundingClientRect().width ?? wrapper.getBoundingClientRect().width) || 1; resize.current = { x: event.clientX, width: block.widthPercent ?? wrapper.getBoundingClientRect().width / container * 100, container, next: mediaWidth(block) }; }}
      onPointerMove={event => { const drag = resize.current; if (!drag) return; drag.next = Math.round(Math.max(25, Math.min(block.wrap && block.wrap !== "none" ? 50 : 100, drag.width + (event.clientX - drag.x) / drag.container * 100))); setDragWidth(drag.next); }}
      onPointerUp={event => { const drag = resize.current; if (!drag) return; resize.current = null; setDragWidth(null); updateAttributes({ block: { ...block, widthPercent: drag.next } }); event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { resize.current = null; setDragWidth(null); }}>↔</button> : null}
  </NodeViewWrapper>;
}
function ArchiveView({ node }: NodeViewProps) {
  const block = node.attrs.block as Block;
  const html = block.type === "list" ? `<${block.ordered ? "ol" : "ul"}>${block.items.map(item => `<li>${item}</li>`).join("")}</${block.ordered ? "ol" : "ul"}>` : "html" in block ? block.html ?? "" : "";
  return <NodeViewWrapper className="np-archive-block" contentEditable={false}><small>Архивен блок · запазва се без промяна</small><div dangerouslySetInnerHTML={{ __html: html }} /></NodeViewWrapper>;
}
function GalleryView({ selected, editor, getPos }: NodeViewProps) {
  const select = () => { const pos = getPos(); if (typeof pos === "number") editor.commands.setNodeSelection(pos); };
  return <NodeViewWrapper className={`np-editor-gallery ${selected ? "is-selected" : ""}`}><span role="button" tabIndex={0} data-drag-handle contentEditable={false} className="np-gallery-heading" aria-label="Избери цялата галерия" onClick={select} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } }}>⠿ Галерия · влачете цялата група</span><NodeViewContent className="np-gallery-images" /></NodeViewWrapper>;
}
function mediaNode(name: string, attribute: string) {
  return TiptapNode.create({
    name, group: "articleMedia", atom: true, draggable: true,
    addAttributes: () => ({ block: { default: null, parseHTML: element => decodeBlock(element, attribute) } }),
    parseHTML: () => [{ tag: `[${attribute}]` }],
    renderHTML: ({ node, HTMLAttributes }) => [name === "npImage" ? "figure" : "div", mergeAttributes(HTMLAttributes, { [attribute]: encodeBlock(node.attrs.block) })],
    addNodeView: () => ReactNodeViewRenderer(name === "npLegacy" ? ArchiveView : MediaView),
  });
}

function selectedBlock(editor: Editor) {
  const selection = editor.state.selection;
  if (selection instanceof NodeSelection) return { node: selection.node, pos: selection.from };
  if (selection.$from.depth > 0) return { node: selection.$from.node(1), pos: selection.$from.before(1) };
  return null;
}
function insertionPosition(editor: Editor) {
  return mediaInsertionPosition(editor.state.selection);
}
function moveSelected(editor: Editor, direction: -1 | 1) {
  const selected = selectedBlock(editor); if (!selected) return;
  const { node, pos } = selected;
  const resolved = editor.state.doc.resolve(pos);
  const parent = resolved.parent;
  const index = resolved.index();
  if (direction < 0 && index === 0 || direction > 0 && index >= parent.childCount - 1) return;
  const adjacent = parent.child(index + direction);
  const start = direction < 0 ? pos - adjacent.nodeSize : pos;
  const end = direction < 0 ? pos + node.nodeSize : pos + node.nodeSize + adjacent.nodeSize;
  const nodes = direction < 0 ? [node, adjacent] : [adjacent, node];
  const tr = editor.state.tr.replaceWith(start, end, nodes);
  tr.setSelection(NodeSelection.create(tr.doc, direction < 0 ? start : start + adjacent.nodeSize));
  editor.view.dispatch(tr); editor.commands.focus();
}

export function VisualArticleEditor({ value, onChange, media, readOnly, onOpenMedia, handleRef, onValidityChange }: {
  value: ArticleBody; onChange: (body: ArticleBody) => void; media: MediaOption[]; readOnly: boolean;
  onOpenMedia: () => void; onValidityChange: (valid: boolean) => void; handleRef: React.RefObject<VisualEditorHandle | null>;
}) {
  const mediaRef = useRef(media); mediaRef.current = media;
  const changeRef = useRef(onChange); changeRef.current = onChange;
  const validityRef = useRef(onValidityChange); validityRef.current = onValidityChange;
  const lastBody = useRef(JSON.stringify(value));
  const pastePlain = useRef(false);
  const [plainPaste, setPlainPaste] = useState(false);
  const [, redraw] = useState(0);
  const [dialog, setDialog] = useState<"embed" | "link" | "symbol" | "help" | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const extensions = useMemo(() => [
    StarterKit.configure({ document: false, heading: { levels: [2, 3, 4] }, link: { openOnClick: false, defaultProtocol: "https" } }),
    TiptapNode.create({ name: "doc", topNode: true, content: "(block | articleMedia)+" }),
    TextAlign.configure({ types: ["heading", "paragraph", "blockquote", "bulletList", "orderedList"] }), TextAttributes, ColorMark,
    mediaNode("npImage", "data-np-image").extend({ addStorage: () => ({ findMedia: (id: string) => mediaRef.current.find(item => item.id === id) }) }),
    mediaNode("npEmbed", "data-np-embed"), mediaNode("npLegacy", "data-np-legacy"),
    TiptapNode.create({ name: "npGallery", group: "articleMedia", content: "npImage+", draggable: true, isolating: true, parseHTML: () => [{ tag: "div[data-np-gallery]" }], renderHTML: () => ["div", { "data-np-gallery": "true" }, 0], addNodeView: () => ReactNodeViewRenderer(GalleryView) }),
  ], []);
  const editor = useEditor({
    extensions, immediatelyRender: false, editable: !readOnly, content: bodyToEditorHtml(value),
    editorProps: {
      attributes: { class: "np-prose np-visual-document", "aria-label": "Текст на материала", role: "textbox", "aria-multiline": "true" },
      handlePaste: (view, event) => { if (!pastePlain.current) return false; const text = event.clipboardData?.getData("text/plain"); if (text === undefined) return false; event.preventDefault(); const nodes = text.replace(/\r\n?/g, "\n").split("\n").map(line => ({ type: "paragraph", content: line ? [{ type: "text", text: line }] : [] })); editor?.chain().insertContent(nodes).run(); pastePlain.current = false; setPlainPaste(false); return true; },
    },
    onUpdate: ({ editor: current }) => {
      try { const body = documentToBody(current.getJSON()); lastBody.current = JSON.stringify(body); changeRef.current(body); validityRef.current(true); setError(""); }
      catch { validityRef.current(false); setError("Има неподдържано съдържание. Отменете последното действие преди запис."); }
    },
    onTransaction: () => redraw(current => current + 1),
  });
  useEffect(() => { if (!editor) return; editor.setEditable(!readOnly); }, [editor, readOnly]);
  useEffect(() => {
    if (!editor || JSON.stringify(value) === lastBody.current) return;
    let cancelled = false;
    // React node views use flushSync; load a revision after the effect commits.
    queueMicrotask(() => {
      if (cancelled || editor.isDestroyed) return;
      lastBody.current = JSON.stringify(value);
      editor.commands.setContent(bodyToEditorHtml(value), { emitUpdate: false });
      validityRef.current(true); setError("");
    });
    return () => { cancelled = true; };
  }, [editor, value]);
  useEffect(() => {
    if (!editor) return;
    handleRef.current = { insertImages: (items, gallery = false) => {
      const groupId = gallery ? crypto.randomUUID() : undefined;
      const images = items.map(item => ({ type: "npImage", attrs: { block: { type: "image", mediaAssetId: item.id, size: "large", widthPercent: 82, ...(groupId ? { groupId } : {}) } } }));
      editor.chain().focus().insertContentAt(insertionPosition(editor), gallery && images.length > 1 ? { type: "npGallery", content: images } : images).run();
    } };
    return () => { handleRef.current = null; };
  }, [editor, handleRef]);
  if (!editor) return <div className="np-editor-loading">Зареждане на редактора…</div>;
  const selected = selectedBlock(editor);
  const block = ["npImage", "npEmbed"].includes(selected?.node.type.name ?? "") ? selected?.node.attrs.block as Extract<Block, { type: "image" | "embed" }> : null;
  const inGallery = !!selected && editor.state.doc.resolve(selected.pos).parent.type.name === "npGallery";
  const imageSize = block?.type === "image" ? Object.entries({ small: 35, medium: 60, large: 82, full: 100 }).find(([, width]) => width === mediaWidth(block))?.[0] ?? "custom" : "custom";
  const patch = (change: Record<string, unknown>) => {
    if (!selected || !block) return;
    const next = { ...block, widthPercent: mediaWidth(block), ...change };
    if (editor.state.doc.resolve(selected.pos).parent.type.name === "npGallery") { delete next.wrap; next.widthPercent = 100; }
    if (next.wrap && next.wrap !== "none") next.widthPercent = Math.min(50, next.widthPercent ?? 50);
    editor.commands.command(({ tr }) => { tr.setNodeMarkup(selected.pos, undefined, { block: next }); tr.setSelection(NodeSelection.create(tr.doc, selected.pos)); return true; });
  };
  const button = (label: string, action: () => void, active = false) => <button type="button" disabled={readOnly} title={label} aria-label={label} aria-pressed={active} onMouseDown={event => event.preventDefault()} onClick={action}>{label}</button>;
  const dialogOpen = (kind: typeof dialog) => { setUrl(kind === "link" ? editor.getAttributes("link").href ?? "" : ""); setError(""); setDialog(kind); };
  const submitUrl = () => {
    if (dialog === "embed") {
      const parsed = parseEmbedInput(url); if (!parsed) { setError("Поставете валиден HTTPS адрес или iframe код."); return; }
      editor.chain().focus().insertContentAt(insertionPosition(editor), { type: "npEmbed", attrs: { block: { type: "embed", ...parsed } } }).run();
    } else {
      if (!url.trim()) editor.chain().focus().extendMarkRange("link").unsetLink().run();
      else { try { if (!["https:", "http:", "mailto:"].includes(new URL(url).protocol)) throw new Error(); editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run(); } catch { setError("Невалиден адрес на връзката."); return; } }
    }
    setDialog(null);
  };
  const textType = selected?.node.type.name;
  const indent = (direction: -1 | 1) => { if (editor.isActive("listItem")) { direction > 0 ? editor.chain().focus().sinkListItem("listItem").run() : editor.chain().focus().liftListItem("listItem").run(); return; } if (textType && ["paragraph", "heading", "blockquote"].includes(textType)) editor.chain().focus().updateAttributes(textType, { indent: Math.max(0, Math.min(3, (selected?.node.attrs.indent ?? 0) + direction)) }).run(); };
  return <div className="np-visual-editor">
    <div className="np-visual-toolbar" role="toolbar" aria-label="Форматиране на материала">
      {button("Добави медия", onOpenMedia)} {button("Embed", () => dialogOpen("embed"))}
      <select aria-label="Стил на блока" disabled={readOnly} value={editor.isActive("heading") ? `h${editor.getAttributes("heading").level}` : "p"} onChange={event => event.target.value === "p" ? editor.chain().focus().setParagraph().run() : editor.chain().focus().setHeading({ level: Number(event.target.value.slice(1)) as 2 | 3 | 4 }).run()}><option value="p">Абзац</option><option value="h2">Заглавие 2</option><option value="h3">Заглавие 3</option><option value="h4">Заглавие 4</option></select>
      {button("Удебелен", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
      {button("Курсив", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
      {button("Подчертан", () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"))}
      {button("Зачеркнат", () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"))}
      {button("Списък", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
      {button("Номериран списък", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {button("Цитат", () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"))}
      {button("Разделител", () => editor.chain().focus().insertContentAt(insertionPosition(editor), { type: "horizontalRule" }).run())}
      {button("Връзка", () => dialogOpen("link"), editor.isActive("link"))}
      <select aria-label="Подравняване на текста" disabled={readOnly} value={editor.getAttributes("paragraph").textAlign ?? editor.getAttributes("heading").textAlign ?? "left"} onChange={event => editor.chain().focus().setTextAlign(event.target.value).run()}><option value="left">Вляво</option><option value="center">Център</option><option value="right">Вдясно</option><option value="justify">Двустранно</option></select>
      <select aria-label="Цвят на текста" disabled={readOnly} value={editor.getAttributes("npColor").color ?? ""} onChange={event => event.target.value ? editor.chain().focus().setMark("npColor", { color: event.target.value }).run() : editor.chain().focus().unsetMark("npColor").run()}><option value="">Основен цвят</option>{COLORS.map((color, index) => <option key={color} value={color}>{["Червен", "Оранжев", "Зелен", "Син", "Лилав", "Приглушен", "Акцент"][index]}</option>)}</select>
      {button("Отстъп навътре", () => indent(1))} {button("Отстъп навън", () => indent(-1))}
      {button("Изчисти форматирането", () => editor.chain().focus().unsetAllMarks().clearNodes().run())}
      {button("Поставяне като чист текст", () => { pastePlain.current = !pastePlain.current; setPlainPaste(pastePlain.current); }, plainPaste)}
      {button("Специални символи", () => dialogOpen("symbol"))}
      {button("Отмени", () => editor.chain().focus().undo().run())} {button("Повтори", () => editor.chain().focus().redo().run())}
      <button type="button" onClick={() => dialogOpen("help")}>Помощ</button>
    </div>
    <div className="np-selection-tools">
    {block ? <fieldset className="np-media-inspector" disabled={readOnly}><legend>{block.type === "image" ? "Избрана снимка" : "Избран embed"}</legend>
      <label>Ширина <input disabled={inGallery} aria-label="Ширина на медията" type="range" min="25" max={block.wrap && block.wrap !== "none" ? 50 : 100} value={mediaWidth(block)} onChange={event => patch({ widthPercent: Number(event.target.value) })} /> <output>{mediaWidth(block)}%</output></label>
      {block.type === "image" ? <label>Размер <select disabled={inGallery} aria-label="Размер на снимката" value={imageSize} onChange={event => { if (event.target.value === "custom") return; patch({ size: event.target.value, widthPercent: { small: 35, medium: 60, large: 82, full: 100 }[event.target.value], wrap: "none" }); }}><option value="custom">По избор</option><option value="small">Малък · 35%</option><option value="medium">Среден · 60%</option><option value="large">Голям · 82%</option><option value="full">Цялата колона · 100%</option></select></label> : null}
      <label>Позиция <select disabled={inGallery} aria-label="Позиция на медията" value={block.align ?? "center"} onChange={event => patch({ align: event.target.value })}><option value="left">Вляво</option><option value="center">Център</option><option value="right">Вдясно</option></select></label>
      <label>Текст около медията <select disabled={inGallery} aria-label="Обтичане на медията" value={block.wrap ?? "none"} onChange={event => patch({ wrap: event.target.value })}><option value="none">Отделен блок</option><option value="left">Медия вляво</option><option value="right">Медия вдясно</option></select></label>
      {block.type === "image" ? <>
        <label>Форма <select aria-label="Форма на снимката" value={block.shape ?? "rectangle"} onChange={event => patch({ shape: event.target.value })}>{[["rectangle", "Правоъгълна"], ["rounded", "Заоблена"], ["circle", "Кръгла"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Рамка <select aria-label="Рамка на снимката" value={block.frame ?? "none"} onChange={event => patch({ frame: event.target.value })}><option value="none">Без рамка</option><option value="soft">Сянка</option><option value="line">Контур</option></select></label>
        <label>Кадър <select aria-label="Кадриране на снимката" value={block.crop ?? "original"} onChange={event => patch({ crop: event.target.value })}><option value="original">Оригинал</option><option value="landscape">Пейзаж</option><option value="square">Квадрат</option><option value="portrait">Портрет</option></select></label>
        {([ ["focalX", "Фокус по хоризонтала", 50, 0, 100], ["focalY", "Фокус по вертикала", 50, 0, 100], ["cropZoom", "Приближение на кадъра", 100, 100, 300] ] as const).map(([key, label, fallback, min, max]) => <label key={key}>{label}<input aria-label={label} type="range" min={min} max={max} value={block[key] ?? fallback} onChange={event => patch({ [key]: Number(event.target.value) })} /><output>{block[key] ?? fallback}</output></label>)}
        <label className="np-wide-control">Надпис <input aria-label="Надпис на снимката" value={block.caption ?? media.find(item => item.id === block.mediaAssetId)?.caption ?? ""} onChange={event => patch({ caption: event.target.value.replace(/[<>]/g, "") })} /></label>
        <label className="np-wide-control">Alt текст <input aria-label="Alt текст на снимката" value={block.alt ?? media.find(item => item.id === block.mediaAssetId)?.alt ?? ""} onChange={event => patch({ alt: event.target.value.replace(/[<>]/g, "") })} /></label>
      </> : null}
    </fieldset> : null}
    {selected && !readOnly ? <div className="np-block-actions" role="group" aria-label="Действия за избрания блок">
      {button("Премести нагоре", () => moveSelected(editor, -1))} {button("Премести надолу", () => moveSelected(editor, 1))}
      {button("Дублирай блока", () => { const item = selectedBlock(editor); if (!item) return; const json = structuredClone(item.node.toJSON()); if (json.type === "npImage" && editor.state.doc.resolve(item.pos).parent.type.name !== "npGallery") delete json.attrs.block.groupId; if (json.type === "npGallery") { const id = crypto.randomUUID(); json.content?.forEach((child: { attrs?: { block?: { groupId?: string } } }) => { if (child.attrs?.block) child.attrs.block.groupId = id; }); } editor.chain().focus().insertContentAt(item.pos + item.node.nodeSize, json).run(); })}
      {inGallery ? button("Извади от галерията", () => { if (!selected) return; const resolved = editor.state.doc.resolve(selected.pos); const parent = resolved.parent; const start = resolved.before(resolved.depth); const end = start + parent.nodeSize; const json = structuredClone(selected.node.toJSON()); delete json.attrs.block.groupId; const tr = editor.state.tr; if (parent.childCount === 1) { tr.delete(start, end); tr.insert(start, editor.schema.nodeFromJSON(json)); tr.setSelection(NodeSelection.create(tr.doc, start)); } else { tr.delete(selected.pos, selected.pos + selected.node.nodeSize); const insertAt = tr.mapping.map(end); tr.insert(insertAt, editor.schema.nodeFromJSON(json)); tr.setSelection(NodeSelection.create(tr.doc, insertAt)); } editor.view.dispatch(tr); editor.commands.focus(); }) : null}
      {button("Премахни блока", () => { const item = selectedBlock(editor); if (!item) return; const resolved = editor.state.doc.resolve(item.pos); const wholeGallery = resolved.parent.type.name === "npGallery" && resolved.parent.childCount === 1; const from = wholeGallery ? resolved.before(resolved.depth) : item.pos; const to = wholeGallery ? from + resolved.parent.nodeSize : item.pos + item.node.nodeSize; editor.chain().focus().deleteRange({ from, to }).run(); })}
    </div> : null}
    </div>
    {error && !dialog ? <p role="alert" className="np-editor-error">{error}</p> : null}
    <EditorContent editor={editor} />
    {value.some(item => item.type === "heading") ? <details className="np-document-outline"><summary>Заглавия в материала</summary>{value.filter(item => item.type === "heading").map((item, index) => item.type === "heading" ? <button type="button" key={index} onClick={() => { let found = 0; editor.state.doc.descendants((node, pos) => { if (node.type.name === "heading" && found++ === index) { editor.commands.setTextSelection(pos + 1); editor.commands.focus(); editor.view.dom.querySelectorAll("h2,h3,h4")[index]?.scrollIntoView({ block: "center", behavior: "smooth" }); } }); }}>{item.text}</button> : null)}</details> : null}
    {dialog ? <EditorDialog onClose={() => setDialog(null)} label={dialog === "embed" ? "Добавяне на embed" : dialog === "link" ? "Редактиране на връзка" : dialog === "symbol" ? "Специални символи" : "Помощ за редактора"}>
      {dialog === "embed" || dialog === "link" ? <><h3>{dialog === "embed" ? "Външна публикация" : "Връзка"}</h3><label>Адрес{dialog === "embed" ? " или iframe код" : ""}<textarea autoFocus value={url} onChange={event => { setUrl(event.target.value); setError(""); }} /></label>{dialog === "embed" && parseEmbedInput(url) ? <div className="np-dialog-embed-preview">{embedFrameUrl(parseEmbedInput(url)!.url) ? <iframe referrerPolicy="strict-origin-when-cross-origin" src={embedFrameUrl(parseEmbedInput(url)!.url)!} title="Преглед на embed" allowFullScreen /> : <a href={parseEmbedInput(url)!.url} target="_blank" rel="noopener noreferrer">Виж публикацията в {EMBED_PROVIDER_LABEL[parseEmbedInput(url)!.provider]}</a>}</div> : null}{error ? <p role="alert">{error}</p> : null}<button type="button" className="np-btn np-btn-primary" onClick={submitUrl}>Приложи</button></>
        : dialog === "symbol" ? <><h3>Специални символи</h3><div className="np-symbols">{["©", "®", "™", "§", "€", "£", "°", "±", "×", "÷", "…", "—", "„", "“", "«", "»", "→", "✓"].map(symbol => <button key={symbol} type="button" onClick={() => { editor.chain().focus().insertContent(escapeHtml(symbol)).run(); setDialog(null); }}>{symbol}</button>)}</div></>
        : <><h3>Работа с редактора</h3><p>Кликнете върху снимка или embed за настройки. Влачете дръжката ⠿ между абзаците; стрелките в действията местят избрания блок. Дръжката ↔ променя ширината. На телефон обтичането се подрежда над текста.</p><p>Ctrl+S записва ръчно. Ctrl+Z отменя, Ctrl+Shift+Z повтаря. „Поставяне като чист текст“ важи за следващото поставяне. Архивните блокове се запазват без промяна.</p></>}
    </EditorDialog> : null}
  </div>;
}
