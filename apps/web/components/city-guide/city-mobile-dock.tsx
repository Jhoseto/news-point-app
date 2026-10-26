"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { requestMobileOverlay } from "@/lib/mobile-overlays";
import "./city-mobile.css";

export function CityMobileDock() {
  const path = usePathname().replace(/\/?$/u, "/");
  const [online, setOnline] = useState(true);
  const [keyboard, setKeyboard] = useState(false);
  const [hash, setHash] = useState("");
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync(); window.addEventListener("hashchange", sync); window.addEventListener("popstate", sync);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); };
  }, [path]);
  useEffect(() => {
    const connection = () => setOnline(navigator.onLine);
    const viewport = () => setKeyboard(!!window.visualViewport && window.innerHeight - window.visualViewport.height > 150);
    connection(); viewport();
    window.addEventListener("online", connection); window.addEventListener("offline", connection);
    window.visualViewport?.addEventListener("resize", viewport);
    return () => { window.removeEventListener("online", connection); window.removeEventListener("offline", connection); window.visualViewport?.removeEventListener("resize", viewport); };
  }, []);
  const tabs = [
    { href: "/moyat-plovdiv/", label: "Днес", icon: "M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10", active: path === "/moyat-plovdiv/" && hash !== "#temi" },
    { href: "/moyat-plovdiv/#temi", label: "Категории", icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z", active: path === "/moyat-plovdiv/" && hash === "#temi" || !["/moyat-plovdiv/", "/moyat-plovdiv/culture/", "/moyat-plovdiv/nightlife/", "/moyat-plovdiv/saved/"].includes(path) },
    { href: "/moyat-plovdiv/culture/", label: "Афиш", icon: "M4 5h16v16H4zM8 3v4m8-4v4M4 11h16m-12 4h2m4 0h2", active: /\/(culture|nightlife)\/$/u.test(path) },
    { href: "/moyat-plovdiv/saved/", label: "Запазени", icon: "M6 3h12v18l-6-4-6 4V3Z", active: path === "/moyat-plovdiv/saved/" },
  ];
  return <>{!online ? <p className="city-connection" role="status">Няма връзка. Данните не се обновяват.</p> : null}<nav className="city-mobile-dock np-bottom-nav" aria-label="Моят Пловдив — бърза навигация" data-keyboard-open={keyboard}>{tabs.map(tab => <Link key={tab.label} href={tab.href} onClick={event => { if (!requestMobileOverlay("home")) { event.preventDefault(); return; } setHash(tab.href.includes("#") ? "#temi" : ""); }} aria-current={tab.active ? "page" : undefined}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={tab.icon} /></svg><span>{tab.label}</span></Link>)}</nav></>;
}
