import { chmod, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../plugins/cfg.js';
import { CookieCrypto } from '../plugins/session/crypto.js';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultEnvPath = path.resolve(apiDir, '.env');
const defaultOutputPath = path.resolve(apiDir, '.env.sam.json');
const parameterEnv = {
  DatabaseUrl: 'DATABASE_URL',
  SupabaseUrl: 'SUPABASE_AUTH_URL',
  SupabasePublishableKey: 'SUPABASE_PUBLISHABLE_KEY',
  SupabaseSecretKey: 'SUPABASE_SECRET_KEY',
  SupabaseJwtAudience: 'SUPABASE_JWT_AUDIENCE',
  PublicOrigin: 'PUBLIC_ORIGIN',
  CookieKeys: 'COOKIE_KEYS',
  DiscordClientId: 'DISCORD_CLIENT_ID',
  DiscordClientSecret: 'DISCORD_CLIENT_SECRET',
  DiscordGuildId: 'DISCORD_GUILD_ID',
  OriginSecret: 'ORIGIN_SECRET',
  DiscordTransferWebhook: 'DISCORD_TRANSFER_WEBHOOK',
};
const deploymentParameters = {
  VercelTeamSlug: 'VERCEL_TEAM_SLUG',
  VercelProjectName: 'VERCEL_PROJECT_NAME',
  ExistingVercelOidcProviderArn: 'EXISTING_VERCEL_OIDC_PROVIDER_ARN',
  RolePermissionsBoundaryArn: 'APPLICATION_ROLE_BOUNDARY_ARN',
};

async function readLocalEnv(envPath) {
  try { return parseEnv(await readFile(envPath, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error('Could not read the local API environment file', { cause: error });
  }
}

function safeValidationError(error) {
  const names = new Set(Array.isArray(error?.issues)
    ? error.issues.map(issue => issue.path?.[0]).filter(name => typeof name === 'string')
    : []);
  for (const envName of [...Object.values(parameterEnv), ...Object.values(deploymentParameters)]) {
    if (error?.message?.includes(envName)) names.add(envName);
  }
  const parameters = [...names].map(name => [...Object.entries(parameterEnv), ...Object.entries(deploymentParameters)].find(([, env]) => env === name)?.[0] ?? name);
  const message = parameters.length > 0
    ? `Invalid deployment parameter(s): ${parameters.join(', ')}`
    : 'Invalid production deployment configuration; check required parameters and production URLs';
  return new Error(message);
}

export async function prepareSamParams({ environment = process.env, envPath = defaultEnvPath, outputPath = defaultOutputPath } = {}) {
  const merged = { ...(await readLocalEnv(envPath)), ...environment, NODE_ENV: 'production' };
  let config;
  try {
    if (!merged.COOKIE_KEYS?.trim()) throw new Error('COOKIE_KEYS is required');
    config = readConfig(merged);
  } catch (error) {
    if (error.message === 'COOKIE_KEYS is required') throw error;
    throw safeValidationError(error);
  }
  try { new CookieCrypto(config.COOKIE_KEYS); }
  catch { throw new Error('COOKIE_KEYS is invalid'); }

  const deploymentInputs = Object.fromEntries(Object.entries(deploymentParameters).map(([parameter, name]) => [parameter, merged[name]?.trim() ?? '']));
  const missingIdentity = ['VercelTeamSlug', 'VercelProjectName'].filter(name => deploymentInputs[name] === '');
  if (missingIdentity.length > 0) throw new Error(`Invalid deployment parameter(s): ${missingIdentity.join(', ')}`);
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(deploymentInputs.VercelTeamSlug) || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(deploymentInputs.VercelProjectName)) {
    throw new Error('Invalid VercelTeamSlug or VercelProjectName deployment parameter');
  }
  if (deploymentInputs.ExistingVercelOidcProviderArn) {
    const providerArn = /^arn:(aws|aws-us-gov|aws-cn):iam::\d{12}:oidc-provider\/oidc\.vercel\.com\/([a-z0-9][a-z0-9-]{0,62})$/;
    const match = deploymentInputs.ExistingVercelOidcProviderArn.match(providerArn);
    if (!match || match[2] !== deploymentInputs.VercelTeamSlug) {
      throw new Error('ExistingVercelOidcProviderArn must be an AWS OIDC provider ARN for VercelTeamSlug');
    }
  }
  if (!/^arn:(aws|aws-us-gov|aws-cn):iam::\d{12}:policy\/[A-Za-z0-9+=,.@_/-]+$/.test(deploymentInputs.RolePermissionsBoundaryArn)) {
    throw new Error('RolePermissionsBoundaryArn must be the ApplicationRoleBoundaryArn from the bootstrap stack');
  }

  const placeholders = Object.values(parameterEnv).filter(name => /REPLACE_|CHANGEME|placeholder/i.test(config[name] ?? ''));
  if (placeholders.length > 0) throw new Error(`Replace deployment placeholders: ${placeholders.join(', ')}`);
  const runtimeEnv = { NODE_ENV: 'production', ...Object.fromEntries(Object.values(parameterEnv).map(name => [name, config[name]])) };
  const bytes = Object.entries(runtimeEnv).filter(([, value]) => value !== undefined)
    .reduce((sum, [key, value]) => sum + Buffer.byteLength(key) + Buffer.byteLength(value), 0);
  if (bytes > 4096) throw new Error(`Lambda environment exceeds 4096 bytes (${bytes} bytes)`);

  // Explicit empty optional parameters clear previous values during stack updates.
  const params = {
    ...Object.fromEntries(Object.entries(parameterEnv).map(([parameter, envName]) => [parameter, runtimeEnv[envName] ?? ''])),
    ...deploymentInputs,
  };
  const output = path.resolve(outputPath);
  const scratchDir = await mkdtemp(path.join(path.dirname(output), '.env.sam-'));
  const tempPath = path.resolve(scratchDir, 'params.json');
  try {
    await writeFile(tempPath, `${JSON.stringify(params, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await rename(tempPath, output);
    await chmod(output, 0o600);
  } catch {
    throw new Error('Could not write the protected SAM parameter file');
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const outputPath = await prepareSamParams();
    process.stdout.write(`Prepared protected SAM parameters at ${outputPath}\n`);
  } catch (error) {
    process.stderr.write(`SAM parameter preparation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
