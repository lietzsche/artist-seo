import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, Artwork, Exhibition, MEDIA_BASE, Profile } from "../lib/api";

export function Home() {
  const query = useQuery({ queryKey: ["featured"], queryFn: () => api<{items: Artwork[]}>("/artworks?size=4") });
  const exhibitions = useQuery({ queryKey:["exhibitions"], queryFn:() => api<Exhibition[]>("/exhibitions") });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api<Profile>("/profile") });
  const current = exhibitions.data?.[0];
  return <>
    <section className="hero"><p className="eyebrow">CONTEMPORARY ARTIST</p><h1>{profile.data?.headline || profile.data?.name || "작품과 전시"}</h1>{profile.data?.intro && <p>{profile.data.intro}</p>}<Link className="button" to="/works">작품 보기</Link></section>
    <section className="section"><div className="section-heading"><h2>선정 작품</h2><Link to="/works">전체 보기</Link></div>
      {query.isPending && <p role="status">작품을 불러오는 중입니다.</p>}
      {query.isError && <p role="alert">작품을 불러오지 못했습니다.</p>}
      {query.data?.items.length === 0 && <p>아직 공개된 작품이 없습니다.</p>}
      <div className="grid">{query.data?.items.map(work => <Link className="card" to={`/works/${work.slug}`} key={work.id}>
        {work.media[0]?.public_key ? <img src={`${MEDIA_BASE}/${work.media[0].public_key}`} alt={work.title} width={work.media[0].width || 1200} height={work.media[0].height || 900} loading="lazy"/> : <div className="placeholder" aria-hidden="true"/>}
        <h3>{work.title}</h3><p>{work.year} · {work.medium}</p></Link>)}</div>
    </section>
    {current ? <section className="exhibition"><p className="eyebrow">CURRENT / RECENT EXHIBITION</p><h2>{current.title}</h2><p>{current.start_date || "일정 미정"}{current.end_date && ` — ${current.end_date}`} · {current.venue}{current.location && `, ${current.location}`}</p><p>{current.description}</p></section> : <section className="exhibition"><p className="eyebrow">EXHIBITION</p><h2>예정된 전시가 없습니다.</h2><p>새 전시 소식은 이곳에 업데이트됩니다.</p></section>}
  </>;
}

