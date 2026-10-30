import { Link, NavLink, Outlet } from "react-router-dom";

export function Layout() {
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

