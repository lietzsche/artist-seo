import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, Profile } from "../lib/api";
import { switchPath, useLang } from "../lib/i18n";
import { useInstall } from "../lib/install";

// 관리 화면과 가이드는 한국어 전용이라 언어 전환을 숨긴다
const KOREAN_ONLY = ["/admin", "/guide"];

/** 검색엔진에 같은 페이지의 다른 언어 주소를 알려준다 (hreflang) */
function useAlternateLinks(pathname: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const origin = window.location.origin;
    const links = ([["en", "en"], ["ko", "ko"], ["x-default", "en"]] as const).map(([hreflang, lang]) => {
      const link = document.createElement("link");
      link.rel = "alternate";
      link.hreflang = hreflang;
      link.href = origin + switchPath(pathname, lang);
      document.head.appendChild(link);
      return link;
    });
    return () => links.forEach(link => link.remove());
  }, [pathname, enabled]);
}

export function Layout() {
  const location = useLocation();
  const { lang, t, to, profile: localize } = useLang();
  const koreanOnly = KOREAN_ONLY.includes(location.pathname);
  // 관리자 계정이 아직 없으면 어느 페이지로 들어와도 첫 설정 화면으로 보낸다
  const setup = useQuery({ queryKey: ["setup"], queryFn: () => api<{ needs_setup: boolean }>("/auth/setup"), staleTime: Infinity });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api<Profile>("/profile") });
  const p = profile.data ? localize(profile.data) : null;
  const name = p?.name || t.fallbackName;
  const [scrolled, setScrolled] = useState(false);
  const install = useInstall();
  const [showIosTip, setShowIosTip] = useState(false);

  useEffect(() => { document.title = `${name} — ${t.siteTitle}`; }, [name, t.siteTitle]);
  useEffect(() => { document.documentElement.lang = koreanOnly ? "ko" : lang; }, [lang, koreanOnly]);
  // 관리 화면·가이드에서는 배경 그림을 숨겨 글을 읽기 쉽게 한다 (styles.css의 html[data-area])
  useEffect(() => { document.documentElement.dataset.area = koreanOnly ? "admin" : "site"; }, [koreanOnly]);
  useAlternateLinks(location.pathname, !koreanOnly);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  if (setup.data?.needs_setup && location.pathname !== "/admin") return <Navigate to="/admin" replace />;
  const other = lang === "en" ? "ko" : "en";
  return <>
    <a className="skip" href="#content">{t.skip}</a>
    <header className={`site-header${scrolled ? " scrolled" : ""}`}>
      <div className="container">
        <Link className="wordmark" to={to("/")}>{name}</Link>
        <nav className="nav" aria-label={t.mainMenu}>
          <NavLink to={to("/works")}>{t.works}</NavLink>
          <NavLink to={to("/about")}>{t.about}</NavLink>
          <NavLink to={to("/contact")}>{t.contact}</NavLink>
          {!koreanOnly && <Link className="lang-switch" to={switchPath(location.pathname, other) + location.search} hrefLang={other} lang={other} aria-label={other === "ko" ? "한국어로 보기" : "View in English"}>{other === "ko" ? "한국어" : "EN"}</Link>}
        </nav>
      </div>
    </header>
    <main id="content"><Outlet /></main>
    <footer className="site-footer">
      <div className="container">
        <span>© {new Date().getFullYear()} {name}{p?.location ? ` · ${p.location}` : ""}</span>
        <nav aria-label={t.footerMenu}>
          <Link to={to("/works")}>{t.works}</Link><Link to={to("/about")}>{t.about}</Link><Link to={to("/contact")}>{t.contact}</Link><Link to="/admin">{t.admin}</Link>
          {install.mode === "prompt" && <button type="button" className="install-btn" onClick={() => void install.install()}>{t.install}</button>}
          {install.mode === "ios" && <button type="button" className="install-btn" aria-expanded={showIosTip} onClick={() => setShowIosTip(v => !v)}>{t.install}</button>}
        </nav>
        {showIosTip && install.mode === "ios" && <p className="install-tip" role="status">{t.iosInstall}</p>}
      </div>
    </footer>
  </>;
}
