import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, FALLBACK_NAME, Profile } from "../lib/api";

export function Layout() {
  const location = useLocation();
  // 관리자 계정이 아직 없으면 어느 페이지로 들어와도 첫 설정 화면으로 보낸다
  const setup = useQuery({ queryKey: ["setup"], queryFn: () => api<{ needs_setup: boolean }>("/auth/setup"), staleTime: Infinity });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api<Profile>("/profile") });
  const name = profile.data?.name || FALLBACK_NAME;
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => { document.title = `${name} — 작업과 전시`; }, [name]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  if (setup.data?.needs_setup && !["/admin", "/guide"].includes(location.pathname)) return <Navigate to="/admin" replace />;
  return <>
    <a className="skip" href="#content">본문으로 건너뛰기</a>
    <header className={`site-header${scrolled ? " scrolled" : ""}`}>
      <div className="container">
        <Link className="wordmark" to="/">{name}</Link>
        <nav className="nav" aria-label="주요 메뉴">
          <NavLink to="/works">작품</NavLink>
          <NavLink to="/about">소개</NavLink>
          <NavLink to="/contact">문의</NavLink>
        </nav>
      </div>
    </header>
    <main id="content"><Outlet /></main>
    <footer className="site-footer">
      <div className="container">
        <span>© {new Date().getFullYear()} {name}{profile.data?.location ? ` · ${profile.data.location}` : ""}</span>
        <nav aria-label="하단 메뉴"><Link to="/works">작품</Link><Link to="/about">소개</Link><Link to="/contact">문의</Link><Link to="/guide">가이드</Link><Link to="/admin">관리</Link></nav>
      </div>
    </footer>
  </>;
}
