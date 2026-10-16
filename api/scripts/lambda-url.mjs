import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const invocationPath = '/2015-03-31/functions/function/invocations';

export function createLambdaUrlServer({
  endpoint = process.env.LAMBDA_ENDPOINT ?? `http://lambda:8080${invocationPath}`,
  timeoutMs = 30_000,
  maxBodyBytes = 6 * 1024 * 1024,
} = {}) {
  let invocation = Promise.resolve();
  return createServer({ requestTimeout: timeoutMs }, async (req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    try {
      const signal = AbortSignal.timeout(timeoutMs);
      const chunks = [];
      let size = 0;
      const incoming = req.iterator({ destroyOnReturn: false });
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > maxBodyBytes) {
          req.resume();
          res.writeHead(413).end('Request body too large');
          return;
        }
        chunks.push(chunk);
      }
      const url = new URL(req.url, 'http://localhost');
      const headers = Object.fromEntries(Object.entries(req.headers)
        .filter(([name, value]) => name !== 'cookie' && value !== undefined)
        .map(([name, value]) => [name, Array.isArray(value) ? value.join(',') : value]));
      const event = {
        version: '2.0', routeKey: '$default', rawPath: url.pathname, rawQueryString: url.search.slice(1), headers,
        cookies: req.headers.cookie?.split(/;\s*/) ?? [],
        requestContext: {
          accountId: '000000000000', apiId: 'local', domainName: req.headers.host ?? 'localhost', domainPrefix: 'local',
          http: {
            method: req.method, path: url.pathname, protocol: `HTTP/${req.httpVersion}`,
            sourceIp: req.socket.remoteAddress ?? '127.0.0.1', userAgent: req.headers['user-agent'] ?? '',
          },
          requestId: randomUUID(), routeKey: '$default', stage: '$default', time: new Date().toUTCString(), timeEpoch: Date.now(),
        },
        body: Buffer.concat(chunks).toString('base64'), isBase64Encoded: true,
      };
      // A single RIE runtime handles one invocation at a time, like a warm Lambda instance.
      const previous = invocation;
      const lock = Promise.withResolvers();
      invocation = lock.promise;
      let result;
      try {
        await previous;
        const response = await fetch(endpoint, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event), signal,
        });
        if (!response.ok || response.headers.has('lambda-runtime-function-error-type')) {
          throw new Error('Lambda invocation failed');
        }
        result = await response.json();
      } finally {
        lock.resolve();
      }
      if (!Number.isSafeInteger(result?.statusCode) || result.statusCode < 200 || result.statusCode > 599
        || (result.body !== undefined && typeof result.body !== 'string')) {
        throw new Error('Invalid Lambda response');
      }
      const body = Buffer.from(result.body ?? '', result.isBase64Encoded ? 'base64' : 'utf8');
      res.writeHead(result.statusCode, { ...result.headers, ...(result.cookies && { 'set-cookie': result.cookies }) });
      res.end(body);
    } catch {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Local Lambda invocation failed');
    }
  });
}

if (import.meta.main) {
  createLambdaUrlServer().listen(3000, '0.0.0.0', () => console.log('Local Lambda Function URL listening on port 3000'));
}
