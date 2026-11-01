// 테스트에서 쓰는 바인딩 타입 (cloudflare:workers의 env)
type EdgeEnv = import("../src/env").Env;
type TestMigration = import("cloudflare:test").D1Migration;

declare namespace Cloudflare {
  interface Env extends EdgeEnv {
    TEST_MIGRATIONS: TestMigration[];
  }
}
