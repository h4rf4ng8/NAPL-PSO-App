import { registerHooks } from 'node:module';
const values = new Map();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key,value); }, removeItem: key => { values.delete(key); }, clear: () => values.clear() }});
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    return url.endsWith('/src/auth/client.ts') ? { ...result, source: `import.meta.env = ${JSON.stringify({ MODE:'test', VITE_API_URL: 'http://api.example.test', VITE_SUPABASE_URL: 'https://auth.example.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' })};\n${result.source}` } : result;
  },
});
