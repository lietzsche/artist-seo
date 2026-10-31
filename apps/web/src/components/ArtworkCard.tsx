import { Link } from "react-router-dom";
import { Artwork, caption, coverOf } from "../lib/api";
import { useLang } from "../lib/i18n";

export function ArtworkCard({ work }: { work: Artwork }) {
  const { t, to, work: localize } = useLang();
  const cover = coverOf(work);
  const w = localize(work);
  return (
    <Link className="work-card fade-in" to={to(`/works/${work.slug}`)}>
      <div className="frame">
        {cover
          ? <img src={cover.src} alt={w.title} width={cover.width} height={cover.height} loading="lazy" />
          : <div className="placeholder" aria-hidden="true">{t.imagePending}</div>}
      </div>
      <div className="caption">
        <span className="t">{w.title}{cover?.isVideo && <span className="video-tag">{t.video}</span>}</span>
        <span className="m">{caption(work, w.medium) || " "}</span>
        {work.sale_status === "sold" && <span className="sale"><span className="dot" aria-hidden="true" />{t.sale.sold}</span>}
      </div>
    </Link>
  );
}
