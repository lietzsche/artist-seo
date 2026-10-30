import { Link } from "react-router-dom";
import { Artwork, caption, coverOf } from "../lib/api";

export function ArtworkCard({ work }: { work: Artwork }) {
  const cover = coverOf(work);
  return (
    <Link className="work-card fade-in" to={`/works/${work.slug}`}>
      <div className="frame">
        {cover
          ? <img src={cover.src} alt={work.title} width={cover.width} height={cover.height} loading="lazy" />
          : <div className="placeholder" aria-hidden="true">이미지 준비 중</div>}
        {cover?.isVideo && <span className="play-badge">VIDEO</span>}
      </div>
      <div className="caption">
        <span className="t">{work.title}</span>
        <span className="m">{caption(work) || " "}</span>
        {work.sale_status === "sold" && <span className="sale"><span className="dot" aria-hidden="true" />판매 완료</span>}
      </div>
    </Link>
  );
}
