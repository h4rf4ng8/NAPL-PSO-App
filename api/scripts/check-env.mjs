const environment = { NODE_ENV: 'production', SUPABASE_JWT_AUDIENCE: 'authenticated', ...process.env };
const required = [
  'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'PUBLIC_ORIGIN',
  'COOKIE_KEYS', 'ORIGIN_SECRET', 'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID',
];
const missing = required.filter(name => !environment[name]?.trim());
const placeholders = required.filter(name => /REPLACE_|CHANGEME|placeholder/i.test(environment[name] ?? ''));
const configured = [
  ...required,
  'NODE_ENV', 'SUPABASE_SECRET_KEY', 'SUPABASE_JWT_AUDIENCE', 'DISCORD_TRANSFER_WEBHOOK',
].filter(name => environment[name] !== undefined);
const envBytes = configured.reduce((total, name) => total + Buffer.byteLength(name) + Buffer.byteLength(environment[name]), 0);
const tooLarge = envBytes > 4096;
if (tooLarge || missing.length > 0 || placeholders.length > 0) {
  const problems = [...missing, ...placeholders];
  if (tooLarge) problems.push(`environment block is ${envBytes} bytes (Lambda limit is 4096)`);
  console.error(`Missing or invalid deployment values: ${problems.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`Required API deployment environment values are present (${envBytes}/4096 bytes).`);
}
