import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, Artwork, coverOf, Exhibition, Profile } from "../lib/api";
import { useLang } from "../lib/i18n";
import { ArtworkCard } from "../components/ArtworkCard";

const period = (e: Exhibition, tbd: string) => [e.start_date, e.end_date].filter(Boolean).join(" — ").replaceAll("-", ".") || tbd;

export function Home() {
  const { t, to, work: localizeWork, profile: localizeProfile, exhibition: localizeExhibition } = useLang();
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api<Profile>("/profile") });
  const featured = useQuery({ queryKey: ["featured"], queryFn: () => api<{ items: Artwork[] }>("/artworks?featured=true&size=6") });
  const latest = useQuery({ queryKey: ["latest"], queryFn: () => api<{ items: Artwork[] }>("/artworks?size=6") });
  const exhibitions = useQuery({ queryKey: ["exhibitions"], queryFn: () => api<Exhibition[]>("/exhibitions") });

  // 대표 작품이 없으면 최신 작품을 대신 보여준다
  const works = featured.data?.items.length ? featured.data.items : latest.data?.items ?? [];
  const heroWork = works.find(w => coverOf(w));
  const hero = heroWork ? coverOf(heroWork) : null;
  const heroTitle = heroWork ? localizeWork(heroWork).title : "";
  const rest = works.filter(w => w !== heroWork);
  const current = exhibitions.data?.[0];
  const ex = current ? localizeExhibition(current) : null;
  const p = profile.data ? localizeProfile(profile.data) : null;

  return <>
    <section className={`container home-hero${hero ? "" : " text-only"}`}>
      <div className="hero-copy">
        {p?.location && <p className="eyebrow">{p.location}</p>}
        <h1 className="display">{p?.headline || p?.name || t.siteTitle}</h1>
        {p?.intro && <p className="lead">{p.intro}</p>}
        <div><Link className="link-arrow" to={to("/works")}>{t.viewWorks} <span aria-hidden="true">→</span></Link></div>
      </div>
      {heroWork && hero && (
        <figure className="hero-figure fade-in">
          <Link to={to(`/works/${heroWork.slug}`)}><img src={hero.src} alt={heroTitle} width={hero.width} height={hero.height} /></Link>
          <figcaption><cite>{heroTitle}</cite>{heroWork.year ? `, ${heroWork.year}` : ""}</figcaption>
        </figure>
      )}
    </section>

    {rest.length > 0 && (
      <section className="container section">
        <div className="section-head"><h2>{featured.data?.items.length ? t.featured : t.recent}</h2><Link className="link-arrow" to={to("/works")}>{t.viewAll} <span aria-hidden="true">→</span></Link></div>
        <div className="works-grid">{rest.map(work => <ArtworkCard key={work.id} work={work} />)}</div>
      </section>
    )}
    {featured.isSuccess && latest.isSuccess && works.length === 0 && <p className="container state">{t.noWorks}</p>}

    {current && ex && (
      <section className="exhibition-band">
        <div className="container">
          <div className="meta"><p className="eyebrow">{t.exhibition}</p><p>{period(current, t.tbd)}</p><p className="muted">{[ex.venue, ex.location].filter(Boolean).join(", ")}</p></div>
          <div><h2 className="title-lg">{ex.title}</h2>{ex.description && <p className="desc">{ex.description}</p>}</div>
        </div>
      </section>
    )}
  </>;
}
