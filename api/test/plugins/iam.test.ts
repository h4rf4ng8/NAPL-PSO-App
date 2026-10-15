import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const template = parseDocument(await readFile(path.join(root, 'template.yaml'), 'utf8'), {
  customTags: ['Ref', 'Sub', 'GetAtt', 'If', 'Not', 'Equals'].map(tag => ({
    tag: `!${tag}`,
    resolve: value => ({ [`Fn::${tag}`]: value }),
  })),
}).toJS();

test('Function URL uses IAM and Vercel role is limited to the SAM live alias URL', async () => {
  const resources = template.Resources;
  assert.equal(resources.ApiFunction.Properties.FunctionUrlConfig.AuthType, 'AWS_IAM');
  assert.equal(resources.ApiFunction.Properties.FunctionUrlConfig.InvokeMode, 'BUFFERED');
  assert.deepEqual(resources.ApiFunction.Properties.ReservedConcurrentExecutions, { 'Fn::Ref': 'ReservedConcurrency' });
  assert.equal(template.Parameters.ReservedConcurrency.Default, 20);
  assert.deepEqual(resources.ApiFunction.Properties.MemorySize, { 'Fn::Ref': 'FunctionMemorySize' });
  assert.equal(template.Parameters.FunctionMemorySize.Default, 512);
  assert.deepEqual(resources.ApiFunction.Properties.Timeout, { 'Fn::Ref': 'FunctionTimeout' });
  assert.equal(template.Parameters.FunctionTimeout.Default, 60);
  assert.match(template.Parameters.VercelTeamSlug.AllowedPattern, /\[a-z0-9-\]/);
  assert.match(template.Parameters.VercelProjectName.AllowedPattern, /\[a-z0-9-\]/);
  assert.match(template.Parameters.ExistingVercelOidcProviderArn.AllowedPattern, /oidc\[\.\]vercel\[\.\]com/);
  assert.equal(resources.VercelInvokeRole.Properties.Policies[0].PolicyDocument.Statement.length, 2);
  const [urlInvoke, functionInvoke] = resources.VercelInvokeRole.Properties.Policies[0].PolicyDocument.Statement;
  assert.equal(urlInvoke.Action, 'lambda:InvokeFunctionUrl');
  assert.deepEqual(urlInvoke.Resource, { 'Fn::GetAtt': 'ApiFunctionAliaslive.AliasArn' });
  assert.deepEqual(urlInvoke.Condition, { StringEquals: { 'lambda:FunctionUrlAuthType': 'AWS_IAM' } });
  assert.equal(functionInvoke.Action, 'lambda:InvokeFunction');
  assert.deepEqual(functionInvoke.Resource, { 'Fn::GetAtt': 'ApiFunctionAliaslive.AliasArn' });
  assert.deepEqual(functionInvoke.Condition, { Bool: { 'lambda:InvokedViaFunctionUrl': true } });
  assert.match(JSON.stringify(resources.VercelInvokeRole.Properties.AssumeRolePolicyDocument), /owner:\$\{VercelTeamSlug\}:project:\$\{VercelProjectName\}:environment:production/);
  assert.match(JSON.stringify(resources.VercelInvokeRole.Properties.AssumeRolePolicyDocument), /https:\/\/vercel\.com\/\$\{VercelTeamSlug\}/);
  assert.match(JSON.stringify(resources.VercelInvokeRole.Properties.AssumeRolePolicyDocument), /sts:AssumeRoleWithWebIdentity/);
  assert.equal(template.Outputs.VercelInvokeRoleArn.Value['Fn::GetAtt'], 'VercelInvokeRole.Arn');
  assert.equal(template.Outputs.FunctionUrl.Value['Fn::GetAtt'], 'ApiFunctionUrl.FunctionUrl');
  assert.doesNotMatch(await readFile(path.join(root, 'template.yaml'), 'utf8'), /AuthType:\s*NONE/);
});

test('SAM parameter mapping excludes Redis and includes only nonsecret Vercel deployment inputs', async () => {
  const script = await readFile(path.join(root, 'scripts/sam-env.mjs'), 'utf8');
  assert.match(script, /VercelTeamSlug:\s*'VERCEL_TEAM_SLUG'/);
  assert.match(script, /VercelProjectName:\s*'VERCEL_PROJECT_NAME'/);
  assert.match(script, /ExistingVercelOidcProviderArn:\s*'EXISTING_VERCEL_OIDC_PROVIDER_ARN'/);
  assert.match(script, /match\[2\] !== deploymentInputs\.VercelTeamSlug/);
  assert.doesNotMatch(script, /RedisUrl|REDIS_URL/);
  assert.match(script, /const runtimeEnv = \{ NODE_ENV: 'production'/);
  assert.doesNotMatch(script.slice(script.indexOf('const runtimeEnv'), script.indexOf('const bytes')), /vercelParameters/);
});
