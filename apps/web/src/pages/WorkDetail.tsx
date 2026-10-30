import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, Artwork, MEDIA_BASE } from "../lib/api";

export function WorkDetail() {
  const { slug } = useParams();
  const query = useQuery({ queryKey: ["work", slug], queryFn: () => api<Artwork>(`/artworks/${slug}`), enabled: !!slug });
  if (query.isPending) return <p className="section" role="status">작품을 불러오는 중입니다.</p>;
  if (query.isError || !query.data) return <p className="section" role="alert">작품을 찾을 수 없습니다.</p>;
  const work = query.data;
  return <article className="work-detail"><div className="media-stack">{work.media.map(media => media.public_key && (media.media_type === "video" ? <video key={media.id} controls preload="metadata"><source src={`${MEDIA_BASE}/${media.public_key}`} type={media.content_type}/></video> : <img key={media.id} src={`${MEDIA_BASE}/${media.public_key}`} alt={`${work.title} 작품 이미지`} width={media.width || 1600} height={media.height || 1200}/>))}{work.media.length === 0 && <div className="placeholder large"/>}</div>
    <aside><p className="eyebrow">{work.year}</p><h1>{work.title}</h1><dl><dt>재료</dt><dd>{work.medium || "-"}</dd><dt>크기</dt><dd>{work.dimensions || "-"}</dd><dt>판매</dt><dd>{work.sale_status === "available" ? "판매 가능" : work.sale_status === "sold" ? "판매 완료" : "문의 불가"}</dd>{work.show_price && <><dt>가격</dt><dd>{work.price_text}</dd></>}</dl><p>{work.description}</p>{work.sale_status === "available" && <Link className="button" to={`/contact?artwork=${work.id}`}>구매 문의</Link>}</aside>
  </article>;
}

