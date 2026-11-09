"use client";

import { createXPost, xPostUrl } from "@newspoint/content";
import { useEffect, useRef, useState } from "react";

export function XPostEmbed({ src, id, className = "" }: { src: string; id?: string | undefined; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const post = xPostUrl(src);
  useEffect(() => {
    setLoaded(false);
    const target = container.current;
    if (!target || !post) return;
    target.replaceChildren();
    let active = true;
    void createXPost(target, post).then(ok => { if (active) setLoaded(ok); });
    return () => { active = false; target.replaceChildren(); };
  }, [post]);
  if (!post) return null;
  return <div id={id} className={`${className} np-x-post`}>
    <div ref={container} />
    {!loaded ? <a href={post} target="_blank" rel="noopener noreferrer">Виж публикацията в X ↗</a> : null}
  </div>;
}
