import { useQuery } from "@tanstack/react-query";
import { api, Exhibition, FALLBACK_NAME, Profile } from "../lib/api";

const lines = (text: string) => text.split("\n").map(line => line.trim()).filter(Boolean);
// "2025 첫 개인전"처럼 연도로 시작하면 연도와 내용을 나눠 표시한다
const splitYear = (line: string) => { const m = line.match(/^(\d{4}(?:\s*[–-]\s*\d{2,4})?)\s+(.*)$/); return m ? [m[1], m[2]] : ["", line]; };

export function About() {
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api<Profile>("/profile") });
  const exhibitions = useQuery({ queryKey: ["exhibitions"], queryFn: () => api<Exhibition[]>("/exhibitions") });
  const p = profile.data;
  const cv = p ? lines(p.cv) : [];
  return <section className="container about">
    <div className="about-side">
      <p className="eyebrow">About</p>
      <h1 className="title-lg">{p?.name || FALLBACK_NAME}</h1>
      {p?.location && <p className="muted" style={{ margin: 0 }}>{p.location}</p>}
    </div>
    <div className="about-body">
      <div className="bio">{p && (p.bio ? lines(p.bio).map((line, i) => <p key={i}>{line}</p>) : <p className="muted">아직 작가 소개가 없습니다.</p>)}</div>
      {cv.length > 0 && <div className="list-block"><h2>약력</h2><ul className="timeline">{cv.map((line, i) => { const [year, text] = splitYear(line); return <li key={i}><time>{year}</time><span>{text}</span></li>; })}</ul></div>}
      <div className="list-block">
        <h2>전시</h2>
        {exhibitions.isPending && <p className="muted" role="status">전시 이력을 불러오는 중입니다.</p>}
        {exhibitions.data?.length === 0 && <p className="muted">등록된 전시가 없습니다.</p>}
        {!!exhibitions.data?.length && <ul className="timeline">{exhibitions.data.map(item => <li key={item.id}><time>{item.start_date?.slice(0, 4) || "—"}</time><span>《{item.title}》, {[item.venue, item.location].filter(Boolean).join(", ")}</span></li>)}</ul>}
      </div>
    </div>
  </section>;
}
