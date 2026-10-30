import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, FALLBACK_NAME, Profile } from "../lib/api";

export function Layout() {
  const location = useLocation();
  // 관리자 계정이 아직 없으면 어느 페이지로 들어와도 첫 설정 화면으로 보낸다
  const setup = useQuery({ queryKey: ["setup"], queryFn: () => api<{ needs_setup: boolean }>("/auth/setup"), staleTime: Infinity });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api<Profile>("/profile") });
  const name = profile.data?.name || FALLBACK_NAME;
  useEffect(() => { document.title = `${name} — 작업과 전시`; }, [name]);
  if (setup.data?.needs_setup && location.pathname !== "/admin") return <Navigate to="/admin" replace />;
  return <>
    <a className="skip" href="#content">본문으로 건너뛰기</a>
    <header className="site-header">
      <Link className="wordmark" to="/">{name}</Link>
      <nav aria-label="주요 메뉴">
        <NavLink to="/works">작품</NavLink><NavLink to="/about">작가</NavLink><NavLink to="/contact">연락</NavLink>
      </nav>
    </header>
    <main id="content"><Outlet /></main>
    <footer><p>© {new Date().getFullYear()} {name}</p></footer>
  </>;
}

