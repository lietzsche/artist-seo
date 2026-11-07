import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { api, Profile } from "../lib/api";
import { useLang } from "../lib/i18n";

const OPEN_MS = 1100;

// 홈 주소를 열 때마다(새로고침 포함) 보인다. 작품 링크 등 다른 주소로 들어왔거나, 사이트 안에서 홈으로 돌아올 때는 보이지 않는다
const landedOnHome = /^\/(ko\/?)?$/.test(window.location.pathname);
let dismissed = false;

/** 첫 화면: 입장 그림(public/theme/entry.jpg)을 크게 보여 주고, 누르면 양쪽 문처럼 열리며 홈이 드러난다 (홈 주소를 열 때마다) */
export function EntryGate() {
  const { t, profile: localize } = useLang();
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api<Profile>("/profile") });
  // 프로필을 받기 전에는 이름 자리만 비워 둔다 (기본 이름이 잠깐 보였다 바뀌지 않게)
  const name = profile.data ? localize(profile.data).name || t.fallbackName : profile.isError ? t.fallbackName : "\u00a0";
  const [state, setState] = useState<"closed" | "opening" | "gone">(() => landedOnHome && !dismissed ? "closed" : "gone");
  const button = useRef<HTMLButtonElement>(null);

  // 열려 있는 동안 뒤의 홈은 스크롤·초점이 가지 않게 막는다
  useEffect(() => {
    if (state === "gone") return;
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    document.documentElement.style.overflow = "hidden";
    return () => {
      root?.removeAttribute("inert");
      document.documentElement.style.overflow = "";
    };
  }, [state === "gone"]);

  useEffect(() => { if (state === "closed") button.current?.focus(); }, [state]);

  const enter = () => {
    if (state !== "closed") return;
    dismissed = true;
    setState("opening");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => setState("gone"), reduce ? 400 : OPEN_MS);
  };

  if (state === "gone") return null;
  return createPortal(
    <div className={`entry-gate${state === "opening" ? " is-open" : ""}`}>
      <div className="entry-door left" aria-hidden="true"><div className="entry-art" /></div>
      <div className="entry-door right" aria-hidden="true"><div className="entry-art" /></div>
      <button ref={button} type="button" className="entry-enter" onClick={enter} aria-label={t.enterSite}>
        <span key={name} className="entry-name">{name}</span>
        <span className="entry-cue" aria-hidden="true">Enter</span>
      </button>
    </div>,
    document.body,
  );
}
