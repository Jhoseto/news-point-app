"use client";

import { useEffect, useState, type ReactNode } from "react";
import "./city-workspace.css";

export type CityWorkspaceSection = { id: string; title: string; description: string; count: number; utility: boolean; content: ReactNode };

export function CityWorkspace({ sections }: { sections: CityWorkspaceSection[] }) {
  const [selected, setSelected] = useState(sections[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [showUtilities, setShowUtilities] = useState(false);
  const active = sections.find(section => section.id === selected) ?? sections[0];
  const sectionIds = sections.map(section => section.id).join("|");

  useEffect(() => {
    const revealHash = () => {
      let hash: string;
      try { hash = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
      const section = sections.find(entry => hash === `nablyudavani-${entry.id}` || hash.startsWith(`city-record-${entry.id}-`));
      if (!section) return;
      setSelected(section.id);
      setShowUtilities(section.utility);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const target = document.getElementById(hash);
        target?.scrollIntoView({ block: "start", behavior: "auto" });
      }));
    };
    const onAnchorClick = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.('a[href^="#"]');
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!sections.some(section => href === `#nablyudavani-${section.id}` || href.startsWith(`#city-record-${section.id}-`))) return;
      event.preventDefault();
      window.history.replaceState(null, "", href);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };
    revealHash();
    window.addEventListener("hashchange", revealHash);
    document.addEventListener("click", onAnchorClick);
    return () => { window.removeEventListener("hashchange", revealHash); document.removeEventListener("click", onAnchorClick); };
  // Refreshing the data must not jump the reader back to the selected heading.
  // Only a changed set of sections needs new hash listeners.
  }, [sectionIds]);

  const needle = query.trim().toLocaleLowerCase("bg");
  const matches = sections.filter(section => !needle || `${section.title} ${section.description}`.toLocaleLowerCase("bg").includes(needle));
  const choose = (section: CityWorkspaceSection) => {
    setSelected(section.id);
    window.history.replaceState(null, "", `#nablyudavani-${section.id}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
  const choice = (section: CityWorkspaceSection) => <button key={section.id} type="button" aria-pressed={active?.id === section.id} aria-controls={`city-panel-${section.id}`} onClick={() => choose(section)} className="city-workspace-choice"><span><strong>{section.title}</strong><small>{section.description}</small></span><span className="city-workspace-choice-arrow" aria-hidden="true">↗</span></button>;

  return <section className="city-workspace" aria-label="Избери справка">
    <aside className="city-workspace-menu">
      <label className="city-workspace-mobile-select">Избери справка<select aria-label="Избор на тема" value={active?.id ?? ""} onChange={event => { const section = sections.find(entry => entry.id === event.target.value); if (section) choose(section); }}><optgroup label="Информация и срокове">{sections.filter(section => !section.utility).map(section => <option key={section.id} value={section.id}>{section.title}</option>)}</optgroup><optgroup label="Адреси и контакти">{sections.filter(section => section.utility).map(section => <option key={section.id} value={section.id}>{section.title}</option>)}</optgroup></select></label>
      <p className="city-workspace-kicker">КАКВО ТЪРСИШ?</p>
      <label className="city-workspace-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Намери тема…" aria-label="Търси в справките" /></label>
      <div className="city-workspace-choices">{matches.filter(section => !section.utility).map(choice)}</div>
      {matches.some(section => section.utility) ? <details className="city-workspace-utilities" open={showUtilities || !!needle} onToggle={event => setShowUtilities(event.currentTarget.open)}><summary>Адреси и полезни контакти <span aria-hidden="true">+</span></summary><div>{matches.filter(section => section.utility).map(choice)}</div></details> : null}
      {!matches.length ? <p className="city-workspace-no-match">Няма справка с тези думи.</p> : null}
    </aside>
    <div className="city-workspace-main" id="city-observed-title">
      {sections.map(section => <div key={section.id} id={`city-panel-${section.id}`} className="city-workspace-panel" hidden={active?.id !== section.id}>{section.content}</div>)}
    </div>
  </section>;
}

