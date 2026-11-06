import React, { useEffect, useRef, useState } from "react";
import type { Media } from "../lib/api";
import { mediaUrl } from "../lib/api";
import { useLang } from "../lib/i18n";

/** 한 작품의 사진·영상. 2장 이상이면 한 장씩 넘겨 본다 (휴대폰은 밀어서, PC는 화살표·←→ 키) */
export function MediaSlider({ media, title }: { media: Media[]; title: string }) {
  const { t } = useLang();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const many = media.length > 1;
  // 칸 높이는 이 작품에서 가장 세로로 긴 사진에 맞춘다 (모두 가로 사진이면 빈 공간이 줄어든다)
  const tallest = Math.max(...media.map(m => (m.width && m.height ? m.height / m.width : 1)));

  // 화면에 가장 많이 보이는 칸을 현재 사진으로 보고, 벗어난 영상은 멈춘다
  useEffect(() => {
    const el = track.current;
    if (!el || !many) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const slide = entry.target as HTMLElement;
        if (entry.isIntersecting) setIndex(Number(slide.dataset.index));
        else slide.querySelector("video")?.pause();
      }
    }, { root: el, threshold: 0.6 });
    el.querySelectorAll(".slide").forEach(slide => observer.observe(slide));
    return () => observer.disconnect();
  }, [many, media]);

  const go = (next: number) => {
    const el = track.current;
    if (!el) return;
    const target = Math.max(0, Math.min(media.length - 1, next));
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: target * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  };

  // 상세 페이지에는 입력칸이 없으므로 페이지 어디서든 ←→로 넘긴다. 영상 조작 중에는 영상이 키를 쓴다
  useEffect(() => {
    if (!many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "VIDEO" || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // 지금 보이는 영상은 재생을 누르기 전부터 받아 둔다. 다른 칸의 영상은 길이·크기 정보만 받는다
  const item = (m: Media, current: boolean) => m.media_type === "video"
    ? <>
        <video controls preload={current ? "auto" : "metadata"} playsInline poster={mediaUrl(m.poster_key)} width={m.width || undefined} height={m.height || undefined}>
          <source src={mediaUrl(m.public_key)} type={m.content_type || "video/mp4"} />
        </video>
        {m.hdr_to_sdr && <p className="media-note">{t.hdrNote}</p>}
      </>
    : <img className="fade-in" src={mediaUrl(m.public_key)} alt={t.imageAlt(title)} width={m.width || 1600} height={m.height || 1200} />;

  if (!many) return <div className="wall">{media[0] ? item(media[0], true) : <div className="placeholder">{t.imagePending}</div>}</div>;

  return <div className="wall slider" role="region" aria-roledescription="carousel" aria-label={t.mediaList}>
    <div className="slides" ref={track} style={{ "--ratio": Math.min(Math.max(tallest, 0.5), 1.6) } as React.CSSProperties}>
      {media.map((m, i) => <div key={m.id} className="slide" data-index={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${media.length}`}>{item(m, i === index)}</div>)}
    </div>
    <div className="slider-bar">
      <button type="button" className="slider-arrow" onClick={() => go(index - 1)} disabled={index === 0} aria-label={t.prevMedia}>‹</button>
      <span className="slider-count" aria-live="polite">{index + 1} / {media.length}</span>
      <button type="button" className="slider-arrow" onClick={() => go(index + 1)} disabled={index === media.length - 1} aria-label={t.nextMedia}>›</button>
    </div>
  </div>;
}
