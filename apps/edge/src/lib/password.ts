import { argon2id } from "@noble/hashes/argon2.js";
import { randomBytes } from "./util";

// 새로 만드는 해시의 비용. OWASP 최소 권장(m=19MiB, t=2, p=1)이고 Workers에서 1회 약 0.2초다.
// 기존 서버(argon2-cffi, m=65536 t=3 p=2)가 만든 해시도 문자열에 적힌 값으로 검증되므로 그대로 쓸 수 있다.
const NEW_HASH = { m: 19456, t: 2, p: 1 };
const MAX_MEMORY_KIB = 131072;

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=+$/, "");
const unb64 = (text: string) => Uint8Array.from(atob(text + "=".repeat((4 - (text.length % 4)) % 4)), ch => ch.charCodeAt(0));

/** argon2-cffi와 같은 PHC 형식: $argon2id$v=19$m=..,t=..,p=..$salt$hash */
export function hashPassword(password: string, cost = NEW_HASH) {
  const salt = randomBytes(16);
  const hash = argon2id(password, salt, { ...cost, dkLen: 32 });
  return `$argon2id$v=19$m=${cost.m},t=${cost.t},p=${cost.p}$${b64(salt)}$${b64(hash)}`;
}

export function verifyPassword(encoded: string, password: string) {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(encoded);
  if (!match) return false;
  const [m, t, p] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m > MAX_MEMORY_KIB || t > 10 || p > 8) return false;
  const expected = unb64(match[5]);
  const actual = argon2id(password, unb64(match[4]), { m, t, p, dkLen: expected.length });
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

let dummy: string | undefined;
/** 계정이 없을 때도 같은 시간이 걸리도록 검증에 쓰는 가짜 해시 */
export const dummyHash = () => (dummy ??= hashPassword(crypto.randomUUID()));
