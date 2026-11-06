import { useEffect } from "react";
import { Link, useRouteError } from "react-router-dom";
import { useLang } from "../lib/i18n";
import { usePageTitle } from "../lib/title";

/** 화면 코드에서 예상 못 한 오류가 났을 때. 머리글·맨 아래 영역은 Layout이 그대로 보여준다 */
export function RouteError() {
  const error = useRouteError();
  const { t, to } = useLang();
  usePageTitle(t.errorTitle);
  useEffect(() => { console.error(error); }, [error]);
  return <section className="container notice-page" role="alert">
    <h1 className="title-lg">{t.errorTitle}</h1>
    <p className="muted">{t.errorBody}</p>
    <div className="notice-links">
      <button type="button" className="link-arrow" onClick={() => window.location.reload()}>{t.reload} <span aria-hidden="true">↻</span></button>
      <Link className="link-arrow" to={to("/")}>{t.goHome} <span aria-hidden="true">→</span></Link>
    </div>
  </section>;
}
