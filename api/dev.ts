import { createApp } from './app.js';
import { readConfig } from './plugins/cfg.js';
import { createRuntime } from './plugins/runtime.js';

const config = readConfig();
const app = createApp(createRuntime(config));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close(); });
}
await app.listen({ port: config.PORT, host: config.HOST });
