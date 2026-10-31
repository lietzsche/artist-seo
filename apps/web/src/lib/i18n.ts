import { useLocation } from "react-router-dom";
import type { Artwork, Exhibition, Profile, Series } from "./api";

// 공개 페이지 언어: 기본은 영어(/...), 한국어는 /ko/... 주소. 관리 화면과 가이드는 한국어만 쓴다.
export type Lang = "en" | "ko";

const en = {
  works: "Works", about: "About", contact: "Contact", admin: "Admin", skip: "Skip to content", mainMenu: "Main menu", footerMenu: "Footer menu",
  fallbackName: "Artist Portfolio", siteTitle: "Works and Exhibitions", viewWorks: "View works", viewAll: "View all",
  featured: "Selected Works", recent: "Recent Works", noWorks: "No works have been published yet.", exhibition: "Exhibition", tbd: "Dates to be announced",
  all: "All", series: "Series", saleStatus: "Availability", count: (n: number) => `${n} ${n === 1 ? "work" : "works"}`,
  loadingWorks: "Loading works…", loadFailed: "Could not load the list.", noMatch: "No works match these filters.",
  imagePending: "Image coming soon", video: "VIDEO",
  sale: { available: "Available", sold: "Sold", unavailable: "Not for sale" } as Record<Artwork["sale_status"], string>,
  workNotFound: "Work not found.", backToWorks: "Back to works", backLink: "← All works",
  medium: "Medium", dimensions: "Size", saleLabel: "Sale", price: "Price", onRequest: "Price on request", inquire: "Inquire about this work",
  imageAlt: (title: string) => `Image of ${title}`, hdrNote: "Converted from HDR to SDR for web playback.",
  noBio: "No biography yet.", cv: "CV", exhibitions: "Exhibitions", loadingExhibitions: "Loading exhibitions…", noExhibitions: "No exhibitions yet.",
  contactLead: "For purchases, exhibitions or collaborations, please leave a message. Your details are used only to reply.",
  inquiryWork: "Inquiring about:", clearWork: "Clear selection", name: "Name", email: "Reply email", message: "Message", messageHint: "At least 10 characters",
  consent: "I agree to the collection of my name and email to receive a reply.", website: "Website", send: "Send", sending: "Sending…",
  sent: "Thank you. Your message has been received and we will reply by email.", sendFailed: "Could not send your message. Please try again.",
  tooMany: "Too many messages. Please try again later.", language: "Language",
};
type Dict = typeof en;

const ko: Dict = {
  works: "작품", about: "소개", contact: "문의", admin: "관리", skip: "본문으로 건너뛰기", mainMenu: "주요 메뉴", footerMenu: "하단 메뉴",
  fallbackName: "작가 포트폴리오", siteTitle: "작업과 전시", viewWorks: "작품 보기", viewAll: "전체 보기",
  featured: "선정 작품", recent: "최근 작품", noWorks: "아직 공개된 작품이 없습니다.", exhibition: "Exhibition", tbd: "일정 미정",
  all: "전체", series: "시리즈", saleStatus: "판매 상태", count: (n: number) => `${n}점`,
  loadingWorks: "작품을 불러오는 중입니다.", loadFailed: "목록을 불러오지 못했습니다.", noMatch: "조건에 맞는 작품이 없습니다.",
  imagePending: "이미지 준비 중", video: "VIDEO",
  sale: { available: "판매 가능", sold: "판매 완료", unavailable: "비매품" },
  workNotFound: "작품을 찾을 수 없습니다.", backToWorks: "작품 목록으로", backLink: "← 작품 목록",
  medium: "재료", dimensions: "크기", saleLabel: "판매", price: "가격", onRequest: "문의", inquire: "이 작품 문의하기",
  imageAlt: (title: string) => `${title} 작품 이미지`, hdrNote: "HDR 원본을 웹 재생용 SDR로 변환했습니다.",
  noBio: "아직 작가 소개가 없습니다.", cv: "약력", exhibitions: "전시", loadingExhibitions: "전시 이력을 불러오는 중입니다.", noExhibitions: "등록된 전시가 없습니다.",
  contactLead: "작품 구매, 전시, 협업에 관한 문의를 남겨 주세요. 입력하신 정보는 답변 목적으로만 사용합니다.",
  inquiryWork: "문의 작품:", clearWork: "작품 선택 해제", name: "이름", email: "회신 이메일", message: "문의 내용", messageHint: "10자 이상 입력해 주세요",
  consent: "문의 답변을 위한 개인정보(이름, 이메일) 수집에 동의합니다.", website: "웹사이트", send: "문의 보내기", sending: "보내는 중…",
  sent: "문의가 접수되었습니다. 확인 후 회신 이메일로 답변드리겠습니다.", sendFailed: "문의 접수에 실패했습니다.",
  tooMany: "잠시 후 다시 문의해 주세요.", language: "언어",
};

const DICTS: Record<Lang, Dict> = { en, ko };

export const langOf = (pathname: string): Lang => (pathname === "/ko" || pathname.startsWith("/ko/") ? "ko" : "en");

/** 같은 페이지의 다른 언어 주소 (/works/a ↔ /ko/works/a) */
export function switchPath(pathname: string, to: Lang): string {
  const bare = langOf(pathname) === "ko" ? pathname.slice(3) || "/" : pathname;
  return to === "ko" ? (bare === "/" ? "/ko" : `/ko${bare}`) : bare;
}

/** 한쪽 언어 칸이 비어 있으면 다른 언어 값을 대신 쓴다 */
const pick = (lang: Lang, ko: string | null | undefined, enValue: string | null | undefined) => {
  const [first, second] = lang === "en" ? [enValue, ko] : [ko, enValue];
  return first?.trim() ? first : second ?? "";
};

export function useLang() {
  const { pathname } = useLocation();
  const lang = langOf(pathname);
  const t = DICTS[lang];
  /** 사이트 안 경로를 현재 언어 주소로 바꾼다 ("/works" → "/ko/works") */
  const to = (path: string) => (lang === "ko" ? (path === "/" ? "/ko" : `/ko${path}`) : path);
  return {
    lang, t, to,
    work: (w: Artwork) => ({
      title: pick(lang, w.title, w.title_en), medium: pick(lang, w.medium, w.medium_en),
      description: pick(lang, w.description, w.description_en), price: pick(lang, w.price_text, w.price_text_en),
    }),
    profile: (p: Profile) => ({
      name: pick(lang, p.name, p.name_en), headline: pick(lang, p.headline, p.headline_en), intro: pick(lang, p.intro, p.intro_en),
      bio: pick(lang, p.bio, p.bio_en), cv: pick(lang, p.cv, p.cv_en), location: pick(lang, p.location, p.location_en),
    }),
    exhibition: (e: Exhibition) => ({
      title: pick(lang, e.title, e.title_en), venue: pick(lang, e.venue, e.venue_en),
      location: pick(lang, e.location, e.location_en), description: pick(lang, e.description, e.description_en),
    }),
    seriesName: (s: Series) => pick(lang, s.name, s.name_en),
  };
}
