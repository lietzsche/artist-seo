import { useQuery } from "@tanstack/react-query";
import { api, Exhibition, Profile } from "../lib/api";
import { useLang } from "../lib/i18n";

const lines = (text: string) => text.split("\n").map(line => line.trim()).filter(Boolean);
// "2025 첫 개인전"처럼 연도로 시작하면 연도와 내용을 나눠 표시한다
const splitYear = (line: string) => { const m = line.match(/^(\d{4}(?:\s*[–-]\s*\d{2,4})?)\s+(.*)$/); return m ? [m[1], m[2]] : ["", line]; };

export function About() {
  const { lang, t, profile: localizeProfile, exhibition: localizeExhibition } = useLang();
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api<Profile>("/profile") });
  const exhibitions = useQuery({ queryKey: ["exhibitions"], queryFn: () => api<Exhibition[]>("/exhibitions") });
  const p = profile.data ? localizeProfile(profile.data) : null;
  const cv = p ? lines(p.cv) : [];
  // 전시명 표기: 한국어는 《제목》, 영어는 기울임 제목
  const titled = (title: string) => lang === "ko" ? `《${title}》` : <i>{title}</i>;
  return <section className="container about">
    <div className="about-side">
      <p className="eyebrow">About</p>
      <h1 className="title-lg">{p?.name || t.fallbackName}</h1>
      {p?.location && <p className="muted" style={{ margin: 0 }}>{p.location}</p>}
    </div>
    <div className="about-body">
      <div className="bio">{p && (p.bio ? lines(p.bio).map((line, i) => <p key={i}>{line}</p>) : <p className="muted">{t.noBio}</p>)}</div>
      {cv.length > 0 && <div className="list-block"><h2>{t.cv}</h2><ul className="timeline">{cv.map((line, i) => { const [year, text] = splitYear(line); return <li key={i}><time>{year}</time><span>{text}</span></li>; })}</ul></div>}
      <div className="list-block">
        <h2>{t.exhibitions}</h2>
        {exhibitions.isPending && <p className="muted" role="status">{t.loadingExhibitions}</p>}
        {exhibitions.data?.length === 0 && <p className="muted">{t.noExhibitions}</p>}
        {!!exhibitions.data?.length && <ul className="timeline">{exhibitions.data.map(item => { const e = localizeExhibition(item); const place = [e.venue, e.location].filter(Boolean).join(", "); return <li key={item.id}><time>{item.start_date?.slice(0, 4) || "—"}</time><span>{titled(e.title)}{place ? `, ${place}` : ""}</span></li>; })}</ul>}
      </div>
    </div>
  </section>;
}
