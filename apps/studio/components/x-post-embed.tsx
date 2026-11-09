"use client";

import { createXPost, xPostUrl } from "@newspoint/content";
import { useEffect, useRef, useState } from "react";

export function XPostEmbed({ src }: { src: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const post = xPostUrl(src);
  useEffect(() => {
    setLoaded(false);
    const target = container.current;
    if (!target || !post || !enabled) return;
    target.replaceChildren();
    let active = true;
    void createXPost(target, post).then(ok => { if (active) setLoaded(ok); });
    return () => { active = false; target.replaceChildren(); };
  }, [post, enabled]);
  if (!post) return null;
  return <div className="np-x-post">
    <div ref={container} />
    {!enabled ? <button type="button" onClick={event => { event.stopPropagation(); setEnabled(true); }}>Зареди преглед от X</button> : null}
    {!loaded ? <a href={post} target="_blank" rel="noopener noreferrer">Виж публикацията в X ↗</a> : null}
  </div>;
}
