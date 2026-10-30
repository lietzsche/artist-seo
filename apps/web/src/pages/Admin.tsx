import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Artwork } from "../lib/api";
import { MediaUpload } from "./MediaUpload";

type Me = { email: string; csrf_token: string };

export function Admin() {
  const client = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me"), retry: false });
  const works = useQuery({ queryKey: ["admin-works"], queryFn: () => api<Artwork[]>("/artworks/admin/all"), enabled: me.isSuccess });
  const [loginError, setLoginError] = useState("");
  async function login(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api("/auth/login", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({email: form.get("email"), password: form.get("password")}) }); await client.invalidateQueries({queryKey:["me"]}); } catch (e) { setLoginError(e instanceof Error ? e.message : "로그인 실패"); } }
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!me.data) return; const form = new FormData(event.currentTarget); await api("/artworks/admin", {method:"POST", headers:{"Content-Type":"application/json", "X-CSRF-Token":me.data.csrf_token}, body:JSON.stringify({slug:form.get("slug"), title:form.get("title"), year:Number(form.get("year")) || null, medium:form.get("medium"), dimensions:"", description:"", price_text:null, show_price:false, sale_status:"unavailable", is_published:false, featured:false, series_id:null})}); event.currentTarget.reset(); await client.invalidateQueries({queryKey:["admin-works"]}); }
  if (me.isPending) return <p className="section" role="status">관리자 상태를 확인하는 중입니다.</p>;
  if (me.isError) return <section className="section page form-page"><p className="eyebrow">ADMIN</p><h1>관리자 로그인</h1><form onSubmit={login}><label>이메일<input type="email" name="email" required/></label><label>비밀번호<input type="password" name="password" required minLength={10}/></label><button className="button">로그인</button></form>{loginError && <p role="alert">{loginError}</p>}</section>;
  return <section className="section page admin"><div className="section-heading"><div><p className="eyebrow">ADMIN</p><h1>작품 관리</h1></div><span>{me.data?.email}</span></div><form className="inline-form" onSubmit={create}><label>제목<input name="title" required/></label><label>주소용 영문 슬러그<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*"/></label><label>연도<input name="year" type="number" min="1000" max="2200"/></label><label>재료<input name="medium"/></label><button className="button">비공개 작품 만들기</button></form><h2>작품 목록</h2>{works.isPending && <p>불러오는 중입니다.</p>}<ul className="admin-list">{works.data?.map(work => <li key={work.id}><div><strong>{work.title}</strong><span>{work.is_published ? "공개" : "비공개"} · {work.year || "연도 미정"} · 미디어 {work.media.length}개</span></div>{me.data && <MediaUpload artworkId={work.id} csrf={me.data.csrf_token} onComplete={() => void client.invalidateQueries({queryKey:["admin-works"]})}/>}</li>)}</ul></section>;
}

