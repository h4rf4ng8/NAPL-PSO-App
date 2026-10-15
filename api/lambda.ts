import { createApp } from './app.js';
import { readConfig } from './plugins/cfg.js';
import { createRuntime } from './plugins/runtime.js';
import { createHandler } from './plugins/lambda.js';

export const handler = createHandler(createApp(createRuntime(readConfig())));
