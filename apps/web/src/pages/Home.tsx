import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, Artwork, coverOf, Exhibition, Profile } from "../lib/api";
import { ArtworkCard } from "../components/ArtworkCard";

const period = (e: Exhibition) => [e.start_date, e.end_date].filter(Boolean).join(" — ").replaceAll("-", ".") || "일정 미정";

export function Home() {
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api<Profile>("/profile") });
  const featured = useQuery({ queryKey: ["featured"], queryFn: () => api<{ items: Artwork[] }>("/artworks?featured=true&size=6") });
  const latest = useQuery({ queryKey: ["latest"], queryFn: () => api<{ items: Artwork[] }>("/artworks?size=6") });
  const exhibitions = useQuery({ queryKey: ["exhibitions"], queryFn: () => api<Exhibition[]>("/exhibitions") });

  // 대표 작품이 없으면 최신 작품을 대신 보여준다
  const works = featured.data?.items.length ? featured.data.items : latest.data?.items ?? [];
  const heroWork = works.find(w => coverOf(w));
  const hero = heroWork ? coverOf(heroWork) : null;
  const rest = works.filter(w => w !== heroWork);
  const current = exhibitions.data?.[0];
  const p = profile.data;

  return <>
    <section className={`container home-hero${hero ? "" : " text-only"}`}>
      <div className="hero-copy">
        {p?.location && <p className="eyebrow">{p.location}</p>}
        <h1 className="display">{p?.headline || p?.name || "작품과 전시"}</h1>
        {p?.intro && <p className="lead">{p.intro}</p>}
        <div><Link className="link-arrow" to="/works">작품 보기 <span aria-hidden="true">→</span></Link></div>
      </div>
      {heroWork && hero && (
        <figure className="hero-figure fade-in">
          <Link to={`/works/${heroWork.slug}`}><img src={hero.src} alt={heroWork.title} width={hero.width} height={hero.height} /></Link>
          <figcaption><cite>{heroWork.title}</cite>{heroWork.year ? `, ${heroWork.year}` : ""}</figcaption>
        </figure>
      )}
    </section>

    {rest.length > 0 && (
      <section className="container section">
        <div className="section-head"><h2>{featured.data?.items.length ? "선정 작품" : "최근 작품"}</h2><Link className="link-arrow" to="/works">전체 보기 <span aria-hidden="true">→</span></Link></div>
        <div className="works-grid">{rest.map(work => <ArtworkCard key={work.id} work={work} />)}</div>
      </section>
    )}
    {featured.isSuccess && latest.isSuccess && works.length === 0 && <p className="container state">아직 공개된 작품이 없습니다.</p>}

    {current && (
      <section className="exhibition-band">
        <div className="container">
          <div className="meta"><p className="eyebrow">Exhibition</p><p>{period(current)}</p><p className="muted">{[current.venue, current.location].filter(Boolean).join(", ")}</p></div>
          <div><h2 className="title-lg">{current.title}</h2>{current.description && <p className="desc">{current.description}</p>}</div>
        </div>
      </section>
    )}
  </>;
}
