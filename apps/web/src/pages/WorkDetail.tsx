import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, Artwork, mediaUrl } from "../lib/api";
import { useLang } from "../lib/i18n";

export function WorkDetail() {
  const { slug } = useParams();
  const { t, to, work: localize } = useLang();
  const query = useQuery({ queryKey: ["work", slug], queryFn: () => api<Artwork>(`/artworks/${slug}`), enabled: !!slug });
  if (query.isPending) return <p className="container state" role="status">{t.loadingWorks}</p>;
  if (query.isError || !query.data) return <div className="container state" role="alert"><p>{t.workNotFound}</p><Link className="link-arrow" to={to("/works")}>{t.backToWorks}</Link></div>;
  const work = query.data;
  const w = localize(work);
  const media = work.media.filter(m => m.public_key);
  return <div className="container">
    <Link className="back" to={to("/works")}>{t.backLink}</Link>
    <article className="detail">
      <div className="wall">
        {media.map(m => m.media_type === "video"
          ? <div key={m.id}>
              <video controls preload="metadata" playsInline poster={mediaUrl(m.poster_key)} width={m.width || undefined} height={m.height || undefined}>
                <source src={mediaUrl(m.public_key)} type="video/mp4" />
              </video>
              {m.hdr_to_sdr && <p className="media-note">{t.hdrNote}</p>}
            </div>
          : <img key={m.id} className="fade-in" src={mediaUrl(m.public_key)} alt={t.imageAlt(w.title)} width={m.width || 1600} height={m.height || 1200} />)}
        {media.length === 0 && <div className="placeholder">{t.imagePending}</div>}
      </div>
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
