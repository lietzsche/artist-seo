import { useQuery } from "@tanstack/react-query";
import { api, Exhibition, FALLBACK_NAME, Profile } from "../lib/api";

const lines = (text: string) => text.split("\n").map(line => line.trim()).filter(Boolean);

export function About() {
  const exhibitions = useQuery({queryKey:["exhibitions"],queryFn:()=>api<Exhibition[]>("/exhibitions")});
  const profile = useQuery({queryKey:["profile"],queryFn:()=>api<Profile>("/profile")});
  const p = profile.data;
  return <section className="section prose page"><p className="eyebrow">ABOUT</p><h1>{p?.name || FALLBACK_NAME}</h1>{p?.location && <p className="eyebrow">{p.location}</p>}{p && lines(p.bio).map((line,i)=><p key={i}>{line}</p>)}{p && !p.bio && <p>아직 작가 소개가 없습니다.</p>}{p && lines(p.cv).length > 0 && <><h2>약력</h2><ul className="history">{lines(p.cv).map((line,i)=><li key={i}>{line}</li>)}</ul></>}<h2>전시 이력</h2>{exhibitions.isPending&&<p role="status">전시 이력을 불러오는 중입니다.</p>}{exhibitions.data?.length===0&&<p>등록된 전시 이력이 없습니다.</p>}<ol className="history">{exhibitions.data?.map(item=><li key={item.id}><time>{item.start_date?.slice(0,4)||"연도 미정"}</time><span>《{item.title}》, {item.venue}{item.location&&`, ${item.location}`}</span></li>)}</ol></section>;
}

