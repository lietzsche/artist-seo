import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Profile } from "../lib/api";

export function ProfileManager({ csrf }: { csrf: string }) {
  const client = useQueryClient();
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api<Profile>("/profile") });
  const [status, setStatus] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(["name", "headline", "intro", "bio", "cv", "location", "name_en", "headline_en", "intro_en", "bio_en", "cv_en", "location_en"].map(key => [key, String(form.get(key) ?? "")]));
    try {
      await api("/profile/admin", { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(body) });
      await client.invalidateQueries({ queryKey: ["profile"] });
      setStatus({ kind: "ok", text: "저장했습니다." });
    } catch (e) { setStatus({ kind: "bad", text: e instanceof Error ? e.message : "저장하지 못했습니다." }); }
  }

  if (!profile.data) return <p className="muted">불러오는 중입니다.</p>;
  const p = profile.data;
  return <section className="panel">
    <h2>작가 프로필</h2>
    <p className="hint">사이트 헤더, 홈, 소개 페이지에 표시됩니다.</p>
    {/* key: 서버 값이 바뀌면 폼을 새 값으로 다시 채운다 */}
    <form key={JSON.stringify(p)} className="admin-form" onSubmit={save}>
      <label className="c6">작가 이름 (헤더·탭 제목)<input name="name" defaultValue={p.name} maxLength={120} /></label>
      <label className="c6">활동 지역<input name="location" defaultValue={p.location} maxLength={120} placeholder="예: 서울" /></label>
      <label className="c12">홈 대표 문구 (홈 큰 제목)<input name="headline" defaultValue={p.headline} maxLength={300} placeholder="예: 빛과 표면에 관한 기록" /></label>
      <label className="c12">홈 소개 문장<textarea name="intro" defaultValue={p.intro} rows={2} maxLength={2000} /></label>
      <label className="c12">작가 소개 (소개 페이지 본문, 줄바꿈으로 문단 구분)<textarea name="bio" defaultValue={p.bio} rows={5} maxLength={10000} /></label>
      <label className="c12">약력 (한 줄에 하나, "2024 내용"처럼 연도로 시작하면 연도가 따로 정렬됨)<textarea name="cv" defaultValue={p.cv} rows={5} maxLength={10000} /></label>
      <fieldset className="lang-fields c12">
        <legend>영어 페이지 <span>기본 사이트는 영어입니다. 비워 둔 칸은 영어 페이지에도 한국어로 나옵니다.</span></legend>
        <label className="c6">영어 작가 이름<input name="name_en" defaultValue={p.name_en} maxLength={120} placeholder="e.g. Jihun Seo" /></label>
        <label className="c6">영어 활동 지역<input name="location_en" defaultValue={p.location_en} maxLength={120} placeholder="e.g. Seoul" /></label>
        <label className="c12">영어 홈 대표 문구<input name="headline_en" defaultValue={p.headline_en} maxLength={300} /></label>
        <label className="c12">영어 홈 소개 문장<textarea name="intro_en" defaultValue={p.intro_en} rows={2} maxLength={2000} /></label>
        <label className="c12">영어 작가 소개<textarea name="bio_en" defaultValue={p.bio_en} rows={5} maxLength={10000} /></label>
        <label className="c12">영어 약력 (한 줄에 하나, "2024 Solo show, Seoul"처럼 연도로 시작)<textarea name="cv_en" defaultValue={p.cv_en} rows={5} maxLength={10000} /></label>
      </fieldset>
      <div className="actions"><button className="btn">프로필 저장</button>{status && <span className={`badge ${status.kind === "ok" ? "on" : "bad"}`} role="status">{status.text}</span>}</div>
    </form>
  </section>;
}
