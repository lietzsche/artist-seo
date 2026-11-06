import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, Profile } from "./api";
import { useLang } from "./i18n";

/**
 * 브라우저 탭 제목. 제목을 주면 "제목 — 작가명", null이면 "작가명 — 작업과 전시"(홈).
 * Layout이 아니라 각 페이지에서 정한다 (React는 자식 효과를 먼저 실행해, 부모가 정하면 덮어쓰게 된다).
 */
export function usePageTitle(title: string | null) {
  const { t, profile: localize } = useLang();
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api<Profile>("/profile") });
  const name = (profile.data && localize(profile.data).name) || t.fallbackName;
  const full = title ? `${title} — ${name}` : `${name} — ${t.siteTitle}`;
  useEffect(() => { document.title = full; }, [full]);
}
