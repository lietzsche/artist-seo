import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, Artwork, MEDIA_BASE } from "../lib/api";

export function Home() {
  const query = useQuery({ queryKey: ["featured"], queryFn: () => api<{items: Artwork[]}>("/artworks?size=4") });
  return <>
    <section className="hero"><p className="eyebrow">CONTEMPORARY ARTIST</p><h1>사라지는 빛과<br/>남겨진 표면</h1><p>서윤은 일상의 표면에 머무는 빛과 시간의 감각을 회화와 영상으로 기록합니다.</p><Link className="button" to="/works">작품 보기</Link></section>
    <section className="section"><div className="section-heading"><h2>선정 작품</h2><Link to="/works">전체 보기</Link></div>
      {query.isPending && <p role="status">작품을 불러오는 중입니다.</p>}
      {query.isError && <p role="alert">작품을 불러오지 못했습니다.</p>}
      {query.data?.items.length === 0 && <p>아직 공개된 작품이 없습니다.</p>}
      <div className="grid">{query.data?.items.map(work => <Link className="card" to={`/works/${work.slug}`} key={work.id}>
        {work.media[0]?.public_key ? <img src={`${MEDIA_BASE}/${work.media[0].public_key}`} alt={work.title} width={work.media[0].width || 1200} height={work.media[0].height || 900} loading="lazy"/> : <div className="placeholder" aria-hidden="true"/>}
        <h3>{work.title}</h3><p>{work.year} · {work.medium}</p></Link>)}</div>
    </section>
    <section className="exhibition"><p className="eyebrow">CURRENT EXHIBITION</p><h2>가상의 전시 — 빛의 체류</h2><p>2026. 11. 2 — 12. 20 · 프로젝트 스페이스</p></section>
  </>;
}

