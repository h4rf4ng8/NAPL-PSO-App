import { errorFields } from './plugins/logging.js';
import { createApp } from './app.js';
import { readConfig } from './plugins/cfg.js';
import { createRuntime } from './plugins/runtime.js';

const config = readConfig();
const app = createApp(createRuntime(config));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close(); });
}
try {
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info({ event: 'api.server.ready', host: config.HOST, port: config.PORT });
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  app.log.error({ event: 'api.server.start_failed', code: code === 'EADDRINUSE' || code === 'EACCES' ? code : 'listen_failed', ...errorFields(error) });
  await app.close();
  process.exitCode = 1;
}
