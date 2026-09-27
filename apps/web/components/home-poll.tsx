"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicPoll } from "@newspoint/db/poll-types";
import "./home-poll.css";

export function HomePoll({ initial }: { initial: PublicPoll }) {
  const [poll,setPoll] = useState(initial);
  const [selected,setSelected] = useState("");
  const [voted,setVoted] = useState<string | null>(null);
  const [results,setResults] = useState(!initial.open);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const ref = useRef<HTMLElement>(null);
  const voteMarker = `np-poll-voted:${initial.id}`;
  function hasVoteMarker() { try { return localStorage.getItem(voteMarker) === "1"; } catch { return false; } }
  function rememberVote() { try { localStorage.setItem(voteMarker,"1"); } catch { /* HttpOnly cookie remains authoritative. */ } }
  function accept(data: {poll: PublicPoll; votedOption: string | null}) { setPoll(data.poll); setVoted(data.votedOption); if (data.votedOption || !data.poll.open) setResults(true); }
  useEffect(() => {
    // Most readers need no personalized DB query. Only browsers that have
    // successfully voted before ask the server to restore their choice.
    if (!hasVoteMarker()) return;
    const controller = new AbortController();
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      observer.disconnect();
      void fetch(`/api/polls/?id=${initial.id}`,{ cache: "no-store", signal: controller.signal }).then(r => r.ok ? r.json() : null).then(data => { if (data) accept(data); }).catch(() => {});
    },{ rootMargin: "200px" });
    if (ref.current) observer.observe(ref.current);
    return () => { observer.disconnect(); controller.abort(); };
  },[initial.id]);
  async function submit() {
    if (!selected || busy) return;
    setBusy(true); setMessage("");
    try {
      const send = async (body: unknown) => { const response = await fetch("/api/polls/",{ method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; };
      const state = await send({ action:"prepare",id:poll.id });
      accept(state);
      if (state.votedOption) { rememberVote(); setMessage("Вече сте гласували. Благодарим за участието!"); return; }
      accept(await send({ action:"vote",id:poll.id,option:selected }));
      rememberVote();
      setMessage("Гласът ви е приет. Благодарим за участието!");
    } catch(e) { setMessage(e instanceof Error ? e.message : "Опитайте отново."); }
    finally { setBusy(false); }
  }
  async function showResults() {
    setResults(true);
    try { const r = await fetch(`/api/polls/?id=${poll.id}`,{cache:"no-store"}); if (r.ok) accept(await r.json()); } catch { /* Keep the last known result. */ }
  }
  return <section ref={ref} className="np-poll-band" aria-labelledby={`poll-${poll.id}`}>
    <div className="np-poll-inner">
      <div className="np-poll-intro">
        <div className="np-poll-kicker"><span className="np-poll-symbol" aria-hidden="true">↗</span> АНКЕТА <span className="np-poll-state">{poll.open ? "Вашето мнение" : "Резултати"}</span></div>
        <h2 id={`poll-${poll.id}`}>{poll.question}</h2>
        {poll.description && <p>{poll.description}</p>}
        <div className="np-poll-meta"><span>{poll.total.toLocaleString("bg-BG")} {poll.total === 1 ? "глас" : "гласа"}</span><span>Един избор. Вашият глас.</span>{poll.endsAt && <span>До {new Intl.DateTimeFormat("bg-BG",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Sofia"}).format(new Date(poll.endsAt))}</span>}</div>
      </div>
      <div className="np-poll-ballot">
        {results ? <div className="np-poll-options" aria-label="Резултати">{poll.options.map(o => <div key={o.id} className="np-poll-result"><span className="np-poll-fill" style={{width:`${o.percent}%`}}/><span>{o.label}{voted === o.id && <small> · Вашият избор</small>}</span><strong>{o.percent}% <small>({o.count})</small></strong></div>)}</div> : <fieldset disabled={busy}><legend className="sr-only">Изберете един отговор</legend><div className="np-poll-options">{poll.options.map(o => <label key={o.id} className="np-poll-option"><input type="radio" name={`poll-${poll.id}`} value={o.id} checked={selected === o.id} onChange={() => setSelected(o.id)}/><span>{o.label}</span></label>)}</div></fieldset>}
        <div className="np-poll-actions">{!results ? <><button className="np-poll-submit" type="button" disabled={!selected || busy} onClick={submit}>{busy ? "Изпращане…" : "Гласувай"}<span aria-hidden="true">↗</span></button><button type="button" onClick={showResults}>Виж резултатите →</button></> : <><span>{voted ? "✓ Вие участвахте" : poll.open ? "Гласуването е отворено" : "Гласуването приключи"}</span>{poll.open && !voted && <button type="button" onClick={() => setResults(false)}>Към гласуването →</button>}</>}</div>
        <p role="status" className="np-poll-message">{message}</p>
      </div>
    </div>
  </section>;
}
