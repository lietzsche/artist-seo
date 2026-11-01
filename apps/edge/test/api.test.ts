import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { Client, createArtwork, json, resetAll } from "./helpers";

beforeEach(resetAll);

describe("기본", () => {
  it("health", async () => {
    const client = new Client();
    expect(await json(await client.get("/api/v1/health/live"))).toEqual({ status: "ok" });
    expect((await client.get("/api/v1/health/ready")).status).toBe(200);
  });

  it("없는 API 경로는 JSON 404", async () => {
    const response = await new Client().get("/api/v1/nothing");
    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ detail: "Not Found" });
  });

  it("기존 서버(argon2-cffi)가 만든 해시를 검증한다", () => {
    const legacy = "$argon2id$v=19$m=65536,t=3,p=2$t6rFLfbzKoh18x7VkU2piw$TrXoJhBio0VoE3U1brdX57H+X2YNUCijRd8RhvQzHSQ";
    expect(verifyPassword(legacy, "correct-horse-battery")).toBe(true);
    expect(verifyPassword(legacy, "wrong-password")).toBe(false);
    const fresh = hashPassword("another-password");
    expect(fresh).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(verifyPassword(fresh, "another-password")).toBe(true);
  });
});

describe("인증", () => {
  it("첫 관리자 설정", async () => {
    const client = new Client();
    expect(await json(await client.get("/api/v1/auth/setup"))).toEqual({ needs_setup: true });
    const short = await client.send("POST", "/api/v1/auth/setup", { email: "owner@example.com", password: "short" });
    expect(short.status).toBe(422);
    expect(typeof (await json(short)).detail).toBe("string");
    const response = await client.setup("Owner@Example.com");
    expect(response.status).toBe(201);
    expect((await json(response)).email).toBe("owner@example.com");
    expect((await json(await client.get("/api/v1/auth/me"))).email).toBe("owner@example.com");
    expect(await json(await client.get("/api/v1/auth/setup"))).toEqual({ needs_setup: false });
    expect((await new Client().setup("intruder@example.com")).status).toBe(409);
  });

  it("동시에 들어온 첫 관리자 설정은 하나만 성공한다", async () => {
    const results = await Promise.all([new Client().setup("a@example.com"), new Client().setup("b@example.com")]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM admins").first<{ n: number }>())?.n).toBe(1);
  });

  it("다른 Origin의 설정 요청은 거절한다", async () => {
    const client = new Client();
    const response = await client.fetch("/api/v1/auth/setup", { method: "POST", json: { email: "owner@example.com", password: "very-safe-password" }, headers: { Origin: "https://evil.example" } });
    expect(response.status).toBe(403);
    expect(await json(await client.get("/api/v1/auth/setup"))).toEqual({ needs_setup: true });
  });

  it("CSRF가 없으면 작품을 만들 수 없다", async () => {
    const client = new Client();
    await client.setup();
    expect((await new Client().get("/api/v1/artworks/admin/all")).status).toBe(401);
    const payload = { slug: "first-work", title: "첫 작품", year: 2026, is_published: true, featured: true, sale_status: "available" };
    expect((await client.send("POST", "/api/v1/artworks/admin", payload, false)).status).toBe(403);
    const created = await client.send("POST", "/api/v1/artworks/admin", payload);
    expect(created.status).toBe(201);
    expect((await client.get("/api/v1/artworks/first-work")).status).toBe(200);
    expect((await client.send("POST", "/api/v1/artworks/admin", payload)).status).toBe(409);
  });

  it("로그인 시도 제한", async () => {
    await new Client().setup();
    const client = new Client();
    for (let i = 0; i < 5; i++) expect((await client.login("owner@example.com", "definitely-wrong")).status).toBe(401);
    expect((await client.login("owner@example.com", "definitely-wrong")).status).toBe(429);
    expect((await client.login()).status).toBe(429);
  });

  it("로그인, 로그아웃 후 세션이 끊긴다", async () => {
    await new Client().setup();
    const client = new Client();
    expect((await client.login()).status).toBe(200);
    expect((await client.get("/api/v1/auth/me")).status).toBe(200);
    const cookie = client.cookie;
    expect((await client.send("POST", "/api/v1/auth/logout")).status).toBe(200);
    client.cookie = cookie;
    expect((await client.get("/api/v1/auth/me")).status).toBe(401);
  });
});

describe("공개 화면", () => {
  it("비공개 작품은 공개 목록과 상세에 나오지 않는다", async () => {
    const client = new Client();
    await client.setup();
    await createArtwork(client, { slug: "private-work", is_published: false });
    expect((await client.get("/api/v1/artworks/private-work")).status).toBe(404);
    expect((await json(await client.get("/api/v1/artworks"))).total).toBe(0);
  });

  it("공개 연도 목록과 필터", async () => {
    const client = new Client();
    await client.setup();
    for (const [slug, year, published, medium] of [["a", 2021, true, "캔버스에 유채"], ["b", 2024, true, "종이에 안료"], ["c", 2024, true, "종이에 먹"], ["d", 2019, false, ""], ["e", null, true, ""]] as const) {
      await createArtwork(client, { slug: `work-${slug}`, title: slug, year, is_published: published, medium, featured: slug === "a" });
    }
    expect(await json(await client.get("/api/v1/artworks/years"))).toEqual([2024, 2021]);
    expect((await json(await client.get("/api/v1/artworks?year=2024"))).total).toBe(2);
    expect((await json(await client.get("/api/v1/artworks?medium=종이"))).total).toBe(2);
    expect((await json(await client.get("/api/v1/artworks?featured=true"))).items.map((i: { slug: string }) => i.slug)).toEqual(["work-a"]);
    const paged = await json(await client.get("/api/v1/artworks?size=2&page=2"));
    expect([paged.items.length, paged.total, paged.page, paged.size]).toEqual([2, 4, 2, 2]);
    expect((await client.get("/api/v1/artworks?size=51")).status).toBe(422);
  });

  it("문의는 동의가 필요하고 횟수 제한이 없다", async () => {
    const client = new Client();
    const body = { name: "구매자", email: "buyer@example.com", message: "작품 구매 가능 여부를 문의합니다.", consent: false, website: "" };
    expect((await client.send("POST", "/api/v1/inquiries", body)).status).toBe(422);
    for (let i = 0; i < 5; i++) expect((await client.send("POST", "/api/v1/inquiries", { ...body, consent: true })).status).toBe(201);
    expect((await client.send("POST", "/api/v1/inquiries", { ...body, consent: true, website: "spam" })).status).toBe(422);
  });

  it("비공개 작품에는 문의할 수 없다", async () => {
    const client = new Client();
    await client.setup();
    const work = await createArtwork(client, { is_published: false });
    const response = await client.send("POST", "/api/v1/inquiries", { artwork_id: work.id, name: "A", email: "a@example.com", message: "문의합니다 문의합니다", consent: true });
    expect(response.status).toBe(404);
  });

  it("웹 매니페스트는 작가 이름과 기기 언어를 따른다", async () => {
    const client = new Client();
    const first = await client.get("/api/v1/manifest.webmanifest");
    expect(first.headers.get("Content-Type")).toMatch(/^application\/manifest\+json/);
    expect((await json(first)).short_name).toBe("Artist Portf");
    await client.setup("owner@example.com", { artist_name: "서지훈" });
    expect((await json(await client.get("/api/v1/manifest.webmanifest"))).name).toBe("서지훈 — Works");
    await client.send("PUT", "/api/v1/profile/admin", { name: "서지훈", name_en: "Noah" });
    const manifest = await json(await client.get("/api/v1/manifest.webmanifest"));
    expect([manifest.name, manifest.short_name, manifest.display]).toEqual(["Noah — Works", "Noah", "standalone"]);
    expect((await json(await client.get("/api/v1/manifest.webmanifest", { "Accept-Language": "ko-KR,ko;q=0.9" }))).start_url).toBe("/ko");
    expect((await json(await client.get("/api/v1/manifest.webmanifest", { "Accept-Language": "en-US" }))).start_url).toBe("/");
  });
});

describe("관리", () => {
  it("설정 때 작가 이름 반영, 프로필 수정", async () => {
    const client = new Client();
    expect((await json(await client.get("/api/v1/profile"))).name).toBe("");
    await client.setup("owner@example.com", { artist_name: "홍길동" });
    expect((await json(await client.get("/api/v1/profile"))).name).toBe("홍길동");
    const body = {
      name: "김작가", headline: "제목", intro: "소개", bio: "본문", cv: "2020 졸업", location: "부산",
      name_en: "Kim", headline_en: "Title", intro_en: "Intro", bio_en: "Bio", cv_en: "2020 Graduated", location_en: "Busan",
      bank_name: "국민은행", bank_account: "123-456-789", bank_holder: "김작가", payment_note: "구매 확정 후 입금", payment_note_en: "Pay after confirmation",
    };
    expect((await client.send("PUT", "/api/v1/profile/admin", body, false)).status).toBe(403);
    expect((await client.send("PUT", "/api/v1/profile/admin", { ...body, name: "  김작가  " })).status).toBe(200);
    expect(await json(await client.get("/api/v1/profile"))).toEqual(body);
  });

  it("시리즈 필터와 전시 관리", async () => {
    const client = new Client();
    await client.setup();
    const created = await client.send("POST", "/api/v1/series/admin", { name: "빛의 표면", description: "가상 시리즈", sort_order: 1 });
    expect(created.status).toBe(201);
    const series = await json(created);
    await createArtwork(client, { slug: "series-work", is_published: true, series_id: series.id });
    expect((await json(await client.get(`/api/v1/artworks?series_id=${series.id}`))).total).toBe(1);
    expect((await json(await client.get("/api/v1/artworks?series_id=missing"))).total).toBe(0);
    const invalid = { slug: "bad-dates", title: "잘못된 날짜", start_date: "2026-12-31", end_date: "2026-01-01", is_published: true };
    const rejected = await client.send("POST", "/api/v1/exhibitions/admin", invalid);
    expect(rejected.status).toBe(422);
    expect((await json(rejected)).detail).toBe("종료일은 시작일보다 빠를 수 없습니다");
    const show = { ...invalid, slug: "light-stay", title: "빛의 체류", start_date: "2026-11-01", end_date: "2026-12-20", venue: "프로젝트 스페이스" };
    expect((await client.send("POST", "/api/v1/exhibitions/admin", show)).status).toBe(201);
    expect((await json(await client.get("/api/v1/exhibitions")))[0].slug).toBe("light-stay");
    expect((await client.get("/api/v1/exhibitions/light-stay")).status).toBe(200);
    expect((await client.send("POST", "/api/v1/exhibitions/admin", show)).status).toBe(409);
    expect((await client.send("DELETE", `/api/v1/series/admin/${series.id}`)).status).toBe(409);
    expect((await client.send("POST", "/api/v1/series/admin", { name: "빛의 표면" })).status).toBe(409);
  });

  it("전시 정렬: 시작일이 없는 전시가 앞에 온다 (기존 PostgreSQL과 같게)", async () => {
    const client = new Client();
    await client.setup();
    for (const [slug, start] of [["old", "2020-01-01"], ["none", null], ["new", "2026-01-01"]] as const) {
      await client.send("POST", "/api/v1/exhibitions/admin", { slug, title: slug, start_date: start, is_published: true });
    }
    expect((await json(await client.get("/api/v1/exhibitions"))).map((e: { slug: string }) => e.slug)).toEqual(["none", "new", "old"]);
  });

  it("영어 필드 왕복과 예전 형식 요청", async () => {
    const client = new Client();
    await client.setup();
    const series = await json(await client.send("POST", "/api/v1/series/admin", { name: "빛", name_en: "Light" }));
    expect(series.name_en).toBe("Light");
    const work = await createArtwork(client, { slug: "en-work", title: "아침", title_en: "Morning", medium_en: "Oil on canvas", description_en: "About light.", price_text_en: "KRW 3,000,000", is_published: true, series_id: series.id });
    const pub = await json(await client.get("/api/v1/artworks/en-work"));
    expect([pub.title, pub.title_en, pub.medium_en, pub.price_text_en, pub.is_published]).toEqual(["아침", "Morning", "Oil on canvas", "KRW 3,000,000", true]);
    expect((await client.send("POST", "/api/v1/exhibitions/admin", { slug: "solo", title: "개인전", title_en: "Solo Show", is_published: true })).status).toBe(201);
    expect((await json(await client.get("/api/v1/exhibitions")))[0].title_en).toBe("Solo Show");
    expect((await json(await client.send("PUT", `/api/v1/artworks/admin/${work.id}`, { slug: "en-work", title: "아침" }))).title_en).toBe("");
  });

  it("시리즈와 전시 수정, 삭제", async () => {
    const client = new Client();
    await client.setup();
    const series = await json(await client.send("POST", "/api/v1/series/admin", { name: "테스트" }));
    const updated = await json(await client.send("PUT", `/api/v1/series/admin/${series.id}`, { name: "혼종", name_en: "Hybrid", sort_order: 2 }));
    expect([updated.name, updated.name_en, updated.sort_order]).toEqual(["혼종", "Hybrid", 2]);
    const work = await createArtwork(client, { slug: "w1", series_id: series.id });
    expect((await client.send("DELETE", `/api/v1/series/admin/${series.id}`)).status).toBe(409);
    await client.send("PUT", `/api/v1/artworks/admin/${work.id}`, { slug: "w1", title: "작품", series_id: null });
    expect((await client.send("DELETE", `/api/v1/series/admin/${series.id}`)).status).toBe(204);
    expect(await json(await client.get("/api/v1/series"))).toEqual([]);

    const show = await json(await client.send("POST", "/api/v1/exhibitions/admin", { slug: "solo", title: "개인전", is_published: true }));
    const changed = await json(await client.send("PUT", `/api/v1/exhibitions/admin/${show.id}`, { slug: "solo", title: "개인전 2", is_published: false }));
    expect([changed.title, changed.is_published]).toEqual(["개인전 2", false]);
    expect(await json(await client.get("/api/v1/exhibitions"))).toEqual([]);
    expect((await client.send("DELETE", `/api/v1/exhibitions/admin/${show.id}`)).status).toBe(204);
    expect(await json(await client.get("/api/v1/exhibitions/admin/all"))).toEqual([]);
  });

  it("휴지통 작품은 관리 목록에서도 빠진다", async () => {
    const client = new Client();
    await client.setup();
    const keep = await createArtwork(client, { slug: "keep" });
    const trash = await createArtwork(client, { slug: "trash", is_published: true });
    expect((await client.send("DELETE", `/api/v1/artworks/admin/${trash.id}`)).status).toBe(204);
    const slugs = (await json(await client.get("/api/v1/artworks/admin/all"))).map((a: { slug: string }) => a.slug);
    expect(slugs).toEqual([keep.slug]);
    expect((await client.get("/api/v1/artworks/trash")).status).toBe(404);
    expect((await client.send("PUT", `/api/v1/artworks/admin/${trash.id}`, { slug: "trash", title: "x" })).status).toBe(404);
  });

  it("문의 관리: 조회, 처리 완료 표시, 삭제", async () => {
    const client = new Client();
    await client.setup();
    const work = await createArtwork(client, { slug: "hybrid", title: "혼종", is_published: true });
    expect((await client.send("POST", "/api/v1/inquiries", { artwork_id: work.id, name: "Buyer", email: "buyer@example.com", message: "Is this still available?", consent: true })).status).toBe(201);
    const items = await json(await client.get("/api/v1/inquiries/admin"));
    expect([items[0].artwork_title, items[0].artwork_slug, items[0].status]).toEqual(["혼종", "hybrid", "new"]);
    expect((await json(await client.get("/api/v1/admin/overview"))).new_inquiries).toBe(1);
    expect((await client.send("PATCH", `/api/v1/inquiries/admin/${items[0].id}`, { status: "done" }, false)).status).toBe(403);
    expect((await json(await client.send("PATCH", `/api/v1/inquiries/admin/${items[0].id}`, { status: "done" }))).status).toBe("done");
    expect((await json(await client.get("/api/v1/admin/overview"))).new_inquiries).toBe(0);
    expect((await client.send("PATCH", `/api/v1/inquiries/admin/${items[0].id}`, { status: "spam" })).status).toBe(422);
    expect((await client.send("DELETE", `/api/v1/inquiries/admin/${items[0].id}`)).status).toBe(204);
    expect(await json(await client.get("/api/v1/inquiries/admin"))).toEqual([]);
    const row = await env.DB.prepare("SELECT name, email FROM inquiries WHERE id = ?").bind(items[0].id).first();
    expect(row).toEqual({ name: "삭제됨", email: "deleted@invalid.local" });
  });
});
