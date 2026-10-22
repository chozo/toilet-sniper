// 調整用の測定（npx vitest run --config tools/sim/vitest.config.ts）
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tools/sim/**/*.test.ts'] } });
