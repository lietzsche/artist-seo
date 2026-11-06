import { Link } from "react-router-dom";
import { useLang } from "../lib/i18n";
import { usePageTitle } from "../lib/title";

/** 어떤 페이지에도 맞지 않는 주소 */
export function NotFound() {
  const { t, to } = useLang();
  usePageTitle(t.notFoundTitle);
  return <section className="container notice-page">
    <p className="eyebrow">404</p>
    <h1 className="title-lg">{t.notFoundTitle}</h1>
    <p className="muted">{t.notFoundBody}</p>
    <div className="notice-links">
      <Link className="link-arrow" to={to("/")}>{t.goHome} <span aria-hidden="true">→</span></Link>
      <Link className="link-arrow" to={to("/works")}>{t.viewWorks} <span aria-hidden="true">→</span></Link>
    </div>
  </section>;
}
