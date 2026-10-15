import type { IncomingMessage, ServerResponse } from 'node:http';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { createProxyHandler, memoizeAwsCredentials } from '../server/proxy.js';

const roleArn = process.env.AWS_ROLE_ARN;
const region = process.env.AWS_REGION;
const provider = roleArn && region
  ? memoizeAwsCredentials(awsCredentialsProvider({ roleArn, clientConfig: { region } }))
  : undefined;

const handler = createProxyHandler({
  env: process.env,
  credentials: provider,
  fetch: fetch,
});

export default async function proxy(request: IncomingMessage, response: ServerResponse): Promise<void> {
  await handler(request, response);
}
