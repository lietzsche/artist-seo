export type Env = {
  DB: D1Database;
  MEDIA_ORIGINALS: R2Bucket;
  MEDIA_PUBLIC: R2Bucket;
  IMAGES: ImagesBinding;
  ASSETS: Fetcher;
  APP_SECRET_KEY: string;
  PUBLIC_ORIGIN: string;
  SESSION_COOKIE_SECURE: string;
  MAX_FILE_BYTES: string;
  MAX_IMAGE_BYTES: string;
  MAX_TOTAL_BYTES: string;
  SHA256_MAX_BYTES: string;
  UPLOAD_EXPIRY_HOURS: string;
  LOGIN_MAX_ATTEMPTS: string;
  LOGIN_WINDOW_MINUTES: string;
};

export type SessionInfo = { id: string; admin_id: string; email: string; csrf_token: string };

export type AppEnv = { Bindings: Env; Variables: { session: SessionInfo } };

/** 문자열로 들어오는 vars를 숫자/불리언으로 읽는다. */
export function settings(env: Env) {
  const int = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    publicOrigin: (env.PUBLIC_ORIGIN || "").replace(/\/+$/, ""),
    cookieSecure: env.SESSION_COOKIE_SECURE !== "false",
    maxFileBytes: int(env.MAX_FILE_BYTES, 5 * 1024 ** 3),
    maxImageBytes: int(env.MAX_IMAGE_BYTES, 20 * 1024 ** 2),
    maxTotalBytes: int(env.MAX_TOTAL_BYTES, 100 * 1024 ** 3),
    sha256MaxBytes: int(env.SHA256_MAX_BYTES, 1024 ** 3),
    uploadExpiryHours: int(env.UPLOAD_EXPIRY_HOURS, 24),
    loginMaxAttempts: int(env.LOGIN_MAX_ATTEMPTS, 5),
    loginWindowMinutes: int(env.LOGIN_WINDOW_MINUTES, 15),
  };
}
