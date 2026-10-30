import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function Layout() {
  const location = useLocation();
  // 관리자 계정이 아직 없으면 어느 페이지로 들어와도 첫 설정 화면으로 보낸다
  const setup = useQuery({ queryKey: ["setup"], queryFn: () => api<{ needs_setup: boolean }>("/auth/setup"), staleTime: Infinity });
  if (setup.data?.needs_setup && location.pathname !== "/admin") return <Navigate to="/admin" replace />;
  return <>
    <a className="skip" href="#content">본문으로 건너뛰기</a>
    <header className="site-header">
      <Link className="wordmark" to="/">서윤</Link>
      <nav aria-label="주요 메뉴">
        <NavLink to="/works">작품</NavLink><NavLink to="/about">작가</NavLink><NavLink to="/contact">연락</NavLink>
      </nav>
    </header>
    <main id="content"><Outlet /></main>
    <footer><p>© {new Date().getFullYear()} 서윤. 이 사이트의 작가와 작품은 개발용 가상 정보입니다.</p></footer>
  </>;
}

