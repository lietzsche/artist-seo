import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, Artwork } from "../lib/api";
import { MediaSlider } from "../components/MediaSlider";
import { useLang } from "../lib/i18n";
import { usePageTitle } from "../lib/title";

export function WorkDetail() {
  const { slug } = useParams();
  const { t, to, work: localize } = useLang();
  // 없는 작품(404)은 다시 물어보지 않고 바로 안내한다. 연결 오류만 두 번까지 다시 시도한다
  const query = useQuery({
    queryKey: ["work", slug], queryFn: () => api<Artwork>(`/artworks/${slug}`), enabled: !!slug,
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  usePageTitle(query.data ? localize(query.data).title : query.isError ? t.workNotFound.replace(/\.$/, "") : t.works);
  if (query.isPending) return <p className="container state" role="status">{t.loadingWorks}</p>;
  if (query.isError || !query.data) return <div className="container state" role="alert"><p>{t.workNotFound}</p><Link className="link-arrow" to={to("/works")}>{t.backToWorks}</Link></div>;
  const work = query.data;
  const w = localize(work);
  // 목록 카드에 쓰인 대표 사진부터 보여준다 (나머지는 올린 순서)
  const ready = work.media.filter(m => m.public_key);
  const media = [...ready.filter(m => m.is_primary), ...ready.filter(m => !m.is_primary)];
  return <div className="container">
    <Link className="back" to={to("/works")}>{t.backLink}</Link>
    <article className="detail">
      <MediaSlider media={media} title={w.title} />
      <aside className="tombstone">
        <div>
          <h1>{w.title}</h1>
          {work.year && <p className="year">{work.year}</p>}
        </div>
        <dl className="specs">
          <dt>{t.medium}</dt><dd>{w.medium || "—"}</dd>
          <dt>{t.dimensions}</dt><dd>{work.dimensions || "—"}</dd>
          <dt>{t.saleLabel}</dt><dd>{work.sale_status === "sold" ? <span className="sale" style={{ margin: 0, color: "inherit", fontSize: "inherit" }}><span className="dot" aria-hidden="true" />{t.sale.sold}</span> : t.sale[work.sale_status]}</dd>
          {work.sale_status === "available" && <><dt>{t.price}</dt><dd>{work.show_price && w.price ? w.price : t.onRequest}</dd></>}
        </dl>
        {w.description && <p className="desc">{w.description}</p>}
        {work.sale_status === "available" && <div><Link className="btn" to={`${to("/contact")}?artwork=${work.id}&title=${encodeURIComponent(w.title)}`}>{t.inquire}</Link></div>}
      </aside>
    </article>
  </div>;
}
