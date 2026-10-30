import { useQuery } from "@tanstack/react-query";
import { api, Exhibition } from "../lib/api";

export function About() {
  const exhibitions = useQuery({queryKey:["exhibitions"],queryFn:()=>api<Exhibition[]>("/exhibitions")});
  return <section className="section prose page"><p className="eyebrow">ABOUT</p><h1>서윤</h1><p>서윤은 서울을 기반으로 활동하는 가상의 현대미술 작가입니다. 이 소개는 실제 작가 정보로 쉽게 교체할 수 있도록 작성된 예시입니다.</p><h2>약력</h2><p>2026 가상 예술대학 회화과 졸업</p><h2>전시 이력</h2>{exhibitions.isPending&&<p role="status">전시 이력을 불러오는 중입니다.</p>}{exhibitions.data?.length===0&&<p>등록된 전시 이력이 없습니다.</p>}<ol className="history">{exhibitions.data?.map(item=><li key={item.id}><time>{item.start_date?.slice(0,4)||"연도 미정"}</time><span>《{item.title}》, {item.venue}{item.location&&`, ${item.location}`}</span></li>)}</ol></section>;
}

