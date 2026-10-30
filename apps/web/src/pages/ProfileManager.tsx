import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Profile } from "../lib/api";

export function ProfileManager({ csrf }: { csrf: string }) {
  const client = useQueryClient();
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api<Profile>("/profile") });
  const [status, setStatus] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(["name", "headline", "intro", "bio", "cv", "location"].map(key => [key, String(form.get(key) ?? "")]));
    try {
      await api("/profile/admin", { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(body) });
      await client.invalidateQueries({ queryKey: ["profile"] });
      setStatus("저장했습니다.");
    } catch (e) { setStatus(e instanceof Error ? e.message : "저장하지 못했습니다."); }
  }
  if (!profile.data) return null;
  const p = profile.data;
  // key로 서버 값이 바뀌면 폼을 다시 채운다
  return <section aria-labelledby="profile-heading"><h2 id="profile-heading">작가 프로필</h2>
    <form key={JSON.stringify(p)} className="compact-form" onSubmit={save}>
      <label>작가 이름 (헤더·제목에 표시)<input name="name" defaultValue={p.name} maxLength={120}/></label>
      <label>활동 지역<input name="location" defaultValue={p.location} maxLength={120}/></label>
      <label>홈 대표 문구<input name="headline" defaultValue={p.headline} maxLength={300}/></label>
      <label>홈 소개 문장<textarea name="intro" defaultValue={p.intro} rows={2} maxLength={2000}/></label>
      <label>작가 소개 (소개 페이지 본문)<textarea name="bio" defaultValue={p.bio} rows={4} maxLength={10000}/></label>
      <label>약력 (한 줄에 하나씩)<textarea name="cv" defaultValue={p.cv} rows={4} maxLength={10000}/></label>
      <button className="button">프로필 저장</button>
    </form>{status && <p role="status">{status}</p>}</section>;
}
