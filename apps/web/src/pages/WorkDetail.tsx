import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, Artwork, mediaUrl, SALE_LABEL } from "../lib/api";

export function WorkDetail() {
  const { slug } = useParams();
  const query = useQuery({ queryKey: ["work", slug], queryFn: () => api<Artwork>(`/artworks/${slug}`), enabled: !!slug });
  if (query.isPending) return <p className="container state" role="status">작품을 불러오는 중입니다.</p>;
  if (query.isError || !query.data) return <div className="container state" role="alert"><p>작품을 찾을 수 없습니다.</p><Link className="link-arrow" to="/works">작품 목록으로</Link></div>;
  const work = query.data;
  const media = work.media.filter(m => m.public_key);
  return <div className="container">
    <Link className="back" to="/works">← 작품 목록</Link>
    <article className="detail">
      <div className="wall">
        {media.map(m => m.media_type === "video"
          ? <div key={m.id}>
              <video controls preload="metadata" playsInline poster={mediaUrl(m.poster_key)} width={m.width || undefined} height={m.height || undefined}>
                <source src={mediaUrl(m.public_key)} type="video/mp4" />
              </video>
              {m.hdr_to_sdr && <p className="media-note">HDR 원본을 웹 재생용 SDR로 변환했습니다.</p>}
            </div>
          : <img key={m.id} className="fade-in" src={mediaUrl(m.public_key)} alt={`${work.title} 작품 이미지`} width={m.width || 1600} height={m.height || 1200} />)}
        {media.length === 0 && <div className="placeholder">이미지 준비 중</div>}
      </div>
      <aside className="tombstone">
        <div>
          <h1>{work.title}</h1>
          {work.year && <p className="year">{work.year}</p>}
        </div>
        <dl className="specs">
          <dt>재료</dt><dd>{work.medium || "—"}</dd>
          <dt>크기</dt><dd>{work.dimensions || "—"}</dd>
          <dt>판매</dt><dd>{work.sale_status === "sold" ? <span className="sale" style={{ margin: 0, color: "inherit", fontSize: "inherit" }}><span className="dot" aria-hidden="true" />판매 완료</span> : SALE_LABEL[work.sale_status]}</dd>
          {work.sale_status === "available" && <><dt>가격</dt><dd>{work.show_price && work.price_text ? work.price_text : "문의"}</dd></>}
        </dl>
        {work.description && <p className="desc">{work.description}</p>}
        {work.sale_status === "available" && <div><Link className="btn" to={`/contact?artwork=${work.id}&title=${encodeURIComponent(work.title)}`}>이 작품 문의하기</Link></div>}
      </aside>
    </article>
  </div>;
}
