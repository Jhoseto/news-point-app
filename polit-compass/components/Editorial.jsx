"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestJSON } from "./editorial-api.mjs";
import { Intake, Reviews, Publication, Corrections, Members, Audit } from "./EditorialPanels";

const sections = [
  ["intake","Предложения"], ["reviews","Рецензии"], ["releases","Версии"],
  ["corrections","Сигнали"], ["audit","Дневник"], ["members","Достъп"]
];

function Access({session}) {
  const local = session.authProvider === "local";
  if (!session.authenticated) {
    return <section className="rs-box"><h2>Вход за редактори</h2>
      {local ? <p>За административен вход отвори PowerShell в папката на проекта и изпълни <code>npm run editor:login</code>. Командата отваря редакторския панел в браузъра.</p> : <p>Влез с профила си в ChatGPT, за да отвориш редакторското пространство.</p>}
      <a className="rs-action rs-primary" href={session.signInPath} target="_top">{local?"Локален вход":"Влез с ChatGPT"}</a></section>;
  }
  return <section className="rs-box"><h2>Достъп до редакцията</h2><p>Този профил е вписан. За редакторски достъп предостави идентификатора си на администратора на компаса.</p>
    <code className="rs-user-id">{session.userId}</code>
    {session.signOutPath && <div><a className="rs-action" href={session.signOutPath} target="_top">Изход от профила</a></div>}</section>;
}

export default function Editorial({catalog,onReleaseChange}) {
  const [session, setSession] = useState(null);
  const [workspace,setWorkspace] = useState(null);
  const [section,setSection] = useState("intake");
  const [loadError,setLoadError] = useState("");
  const [notice,setNotice] = useState(null);
  const [working,setWorking] = useState(false);
  const [reload,setReload] = useState(0);
  const active = useRef(false);
  const locked = useRef(false);
  const lastRelease = useRef(null);
  const acceptWorkspace = useCallback(next=>{
    const id=next.currentReleaseId;
    if(lastRelease.current && lastRelease.current!==id) onReleaseChange?.(id);
    lastRelease.current=id;
    setWorkspace(next);
  },[onReleaseChange]);

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    async function load() {
      setLoadError("");
      try {
        const identity = await requestJSON("/api/admin/session",options);
        if (controller.signal.aborted) return;
        setSession(identity);
        if (identity.authenticated && ["admin","editor"].includes(identity.role)) {
          const next = await requestJSON("/api/admin/workspace",options);
          if (!controller.signal.aborted) acceptWorkspace(next);
        } else {
          setWorkspace(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error.message);
      }
    }
    load();
    return () => { active.current = false; controller.abort(); };
  },[reload,acceptWorkspace]);

  const run = useCallback(async (task, success, refresh=true) => {
    if (locked.current) return;
    locked.current = true;
    setWorking(true);
    setNotice(null);
    try {
      const result = await task();
      if (refresh && active.current) {
        try {
          const next = await requestJSON("/api/admin/workspace");
          if (active.current) acceptWorkspace(next);
        } catch {
          if (active.current) setLoadError("Операцията е записана. Натисни „Обнови“, за да заредиш актуалните данни.");
        }
      }
      if (active.current && success) setNotice({text:success,error:false});
      return result;
    } catch (error) {
      if (active.current) {
        setNotice({text:error.message,error:true});
        if (error.status === 401 || error.status === 403) setReload(n => n+1);
      }
    } finally {
      locked.current = false;
      if (active.current) setWorking(false);
    }
  },[acceptWorkspace]);
  if (loadError) return <section role="alert" className="rs-box"><h2>Връзка с редакцията</h2><p>{loadError}</p><button className="rs-action" onClick={() => setReload(n=>n+1)}>Обнови</button></section>;
  if (!session) return <p className="rs-load" role="status">Проверяване на достъпа…</p>;
  if (!session.authenticated || !["admin","editor"].includes(session.role)) return <Access session={session}/>;
  if (!workspace) return <p className="rs-load" role="status">Зареждане на редакторските записи…</p>;
  const admin = session.role === "admin";
  const panelProps = {session,workspace,catalog,working,run};
  let panel;
  if (section==="reviews") panel = <Reviews {...panelProps}/>;
  else if (section==="releases") panel = <Publication {...panelProps}/>;
  else if (section==="corrections") panel = <Corrections {...panelProps}/>;
  else if (section==="audit") panel = <Audit {...panelProps}/>;
  else if (section==="members" && admin) panel = <Members {...panelProps}/>;
  else panel = <Intake {...panelProps}/>;
  return <>
    <div className="rs-editorbar"><span><i/>{admin ? "Администратор" : "Редактор"}</span><div className="rs-row"><button disabled={working} onClick={() => {setNotice(null);setReload(n=>n+1);}}>Обнови</button>{session.signOutPath && <a className="rs-exit" href={session.signOutPath} target="_top">Изход</a>}</div></div>
    <nav className="rs-editornav" aria-label="Редакторски раздели">{sections.filter(([key])=>key!=="members" || admin).map(([key,title]) =>
      <button key={key} type="button" disabled={working} aria-current={section===key?"page":undefined} onClick={()=>{setSection(key);setNotice(null);}}>{title}</button>
    )}</nav>
    {notice && <p role={notice.error?"alert":"status"} className={notice.error?"rs-notice rs-error":"rs-notice"}>{notice.text}</p>}
    {working && <p className="rs-status" role="status">Обработка на заявката…</p>}
    {panel}
  </>;
}
