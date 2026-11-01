#!/usr/bin/env node
// 관리자 계정을 만들거나 비밀번호를 바꾼다 (기존 서버의 sync-admin / reset-admin 대신).
// 이미 있는 이메일이면 비밀번호를 바꾸고 그 관리자의 로그인 세션을 모두 끊는다.
//
//   npm run create-admin -- owner@example.com              # 운영 D1
//   npm run create-admin -- owner@example.com --staging    # 스테이징 D1
//   npm run create-admin -- owner@example.com --local      # 내 PC의 wrangler dev D1
//
// 비밀번호는 화면에 보이지 않게 입력받는다. 해시가 셸 기록에 남지 않도록 임시 SQL 파일로 실행하고 바로 지운다.
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { argon2id } from "@noble/hashes/argon2.js";

const args = process.argv.slice(2);
const email = (args.find(a => !a.startsWith("--")) || "").trim().toLowerCase();
const staging = args.includes("--staging");
const local = args.includes("--local");
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("사용법: npm run create-admin -- <이메일> [--staging | --local]");
  process.exit(1);
}

function askHidden(question) {
  return new Promise(resolve => {
    const stdin = process.stdin;
    process.stdout.write(question);
    if (!stdin.isTTY) {
      let data = "";
      stdin.setEncoding("utf8");
      stdin.on("data", chunk => (data += chunk));
      stdin.on("end", () => resolve(data.split(/\r?\n/)[0]));
      return;
    }
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = ch => {
      if (ch === "\r" || ch === "\n") { stdin.setRawMode(false); stdin.pause(); stdin.off("data", onData); process.stdout.write("\n"); resolve(value); }
      else if (ch === "\u0003") process.exit(130);
      else if (ch === "\u007f") value = value.slice(0, -1);
      else value += ch;
    };
    stdin.on("data", onData);
  });
}

const password = await askHidden("새 비밀번호 (10~200자): ");
if (password.length < 10 || password.length > 200) {
  console.error("비밀번호는 10자 이상 200자 이하여야 합니다.");
  process.exit(1);
}
if (process.stdin.isTTY && (await askHidden("한 번 더 입력: ")) !== password) {
  console.error("두 비밀번호가 다릅니다.");
  process.exit(1);
}

// Worker(src/lib/password.ts)와 같은 형식과 비용
const cost = { m: 19456, t: 2, p: 1 };
const b64 = bytes => Buffer.from(bytes).toString("base64").replace(/=+$/, "");
const salt = randomBytes(16);
const hash = `$argon2id$v=19$m=${cost.m},t=${cost.t},p=${cost.p}$${b64(salt)}$${b64(argon2id(password, salt, { ...cost, dkLen: 32 }))}`;

const now = new Date().toISOString();
const q = text => `'${String(text).replace(/'/g, "''")}'`;
const sql = `
INSERT INTO admins (id, email, password_hash, is_active, created_at) VALUES (${q(randomUUID())}, ${q(email)}, ${q(hash)}, 1, ${q(now)})
  ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash, is_active = 1;
UPDATE admin_sessions SET revoked_at = ${q(now)} WHERE revoked_at IS NULL AND admin_id = (SELECT id FROM admins WHERE email = ${q(email)});
`;

const dir = mkdtempSync(join(tmpdir(), "artist-admin-"));
const file = join(dir, "admin.sql");
try {
  writeFileSync(file, sql, { mode: 0o600 });
  const database = staging ? "artist-portfolio-staging" : "artist-portfolio";
  const wranglerArgs = ["wrangler", "d1", "execute", database, local ? "--local" : "--remote", "--file", file];
  if (staging) wranglerArgs.push("--env", "staging");
  const result = spawnSync("npx", wranglerArgs, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`관리자 ${email} 계정을 저장했습니다. 기존 로그인 세션은 모두 끊었습니다.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
