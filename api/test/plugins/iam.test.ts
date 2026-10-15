import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const customTags = ['Ref', 'Sub', 'GetAtt', 'If', 'Not', 'Equals'].map(tag => ({
  tag: `!${tag}`,
  resolve: (value: string) => ({ [`Fn::${tag}`]: value }),
}));
const template = parseDocument(await readFile(path.join(root, 'template.yaml'), 'utf8'), {
  customTags,
}).toJS();
const bootstrap = parseDocument(await readFile(path.join(root, 'deploy-bootstrap.yaml'), 'utf8'), {
  customTags,
}).toJS();

test('Function URL uses IAM and Vercel role is limited to the SAM live alias URL', async () => {
  const resources = template.Resources;
  assert.equal(resources.ApiFunction.Properties.FunctionUrlConfig.AuthType, 'AWS_IAM');
  assert.equal(resources.ApiFunction.Properties.FunctionUrlConfig.InvokeMode, 'BUFFERED');
  assert.deepEqual(resources.ApiFunction.Properties.ReservedConcurrentExecutions, [
    'HasReservedConcurrency', { 'Fn::Ref': 'ReservedConcurrency' }, { 'Fn::Ref': 'AWS::NoValue' },
  ]);
  assert.equal(template.Parameters.ReservedConcurrency.Default, -1);
  assert.equal(template.Parameters.ReservedConcurrency.MinValue, -1);
  assert.deepEqual(template.Conditions.HasReservedConcurrency, [[{ 'Fn::Ref': 'ReservedConcurrency' }, -1]]);
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
  for (const role of ['ApiRole', 'VercelInvokeRole']) {
    assert.deepEqual(resources[role].Properties.PermissionsBoundary, { 'Fn::Ref': 'RolePermissionsBoundaryArn' });
  }
  assert.doesNotMatch(await readFile(path.join(root, 'template.yaml'), 'utf8'), /AuthType:\s*NONE/);
});

test('SAM parameter mapping keeps deployment identities outside the Lambda environment', async () => {
  const script = await readFile(path.join(root, 'scripts/sam-env.mjs'), 'utf8');
  assert.match(script, /VercelTeamSlug:\s*'VERCEL_TEAM_SLUG'/);
  assert.match(script, /VercelProjectName:\s*'VERCEL_PROJECT_NAME'/);
  assert.match(script, /ExistingVercelOidcProviderArn:\s*'EXISTING_VERCEL_OIDC_PROVIDER_ARN'/);
  assert.match(script, /RolePermissionsBoundaryArn:\s*'APPLICATION_ROLE_BOUNDARY_ARN'/);
  assert.match(script, /match\[2\] !== deploymentInputs\.VercelTeamSlug/);
  assert.doesNotMatch(script, /RedisUrl|REDIS_URL/);
  assert.match(script, /const runtimeEnv = \{ NODE_ENV: 'production'/);
  assert.doesNotMatch(script.slice(script.indexOf('const runtimeEnv'), script.indexOf('const bytes')), /deploymentParameters/);
});

test('GitHub federation starts disabled and is bound to this repository Production environment', () => {
  assert.equal(bootstrap.Parameters.EnableGitHubDeployment.Default, 'false');
  assert.deepEqual(bootstrap.Conditions.GitHubDeploymentEnabled, [{ 'Fn::Ref': 'EnableGitHubDeployment' }, 'true']);
  const statements = bootstrap.Resources.GitHubDeployRole.Properties.AssumeRolePolicyDocument.Statement;
  assert.equal(statements.length, 1);
  assert.deepEqual(statements[0].Effect, ['GitHubDeploymentEnabled', 'Allow', 'Deny']);
  assert.deepEqual(statements[0].Principal, { Federated: { 'Fn::Ref': 'GitHubOidcProvider' } });
  assert.equal(statements[0].Action, 'sts:AssumeRoleWithWebIdentity');
  assert.deepEqual(statements[0].Condition.StringEquals, {
    'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
    'token.actions.githubusercontent.com:sub': 'repo:h4rf4ng8/NAPL-PSO-App:environment:Production',
  });
});

test('deployment grants cannot update the bootstrap or create unbounded application roles', () => {
  const github = bootstrap.Resources.GitHubDeployRole.Properties.Policies[0].PolicyDocument.Statement;
  const execution = bootstrap.Resources.CloudFormationExecutionRole.Properties.Policies[0].PolicyDocument.Statement;
  const createChangeSet = github.find(statement => statement.Sid === 'PrepareApplicationChangeSet');
  assert.deepEqual(createChangeSet.Condition.ArnEquals, { 'cloudformation:RoleArn': { 'Fn::GetAtt': 'CloudFormationExecutionRole.Arn' } });
  assert.match(createChangeSet.Resource['Fn::Sub'], /:stack\/\$\{ApplicationStackName\}\/\*$/);
  const liveCheck = github.find(statement => statement.Sid === 'CheckLiveAlias');
  assert.deepEqual(liveCheck.Action, ['lambda:GetFunctionUrlConfig', 'lambda:InvokeFunction']);
  assert.match(liveCheck.Resource['Fn::Sub'], /:function:\$\{ApplicationStackName\}-api:live$/);
  for (const statement of github) {
    for (const action of [statement.Action].flat()) {
      assert.ok(action !== '*' && !action.endsWith(':*'), `unbounded deployment action ${action}`);
      if (!action.startsWith('iam:')) continue;
      assert.equal(action, 'iam:PassRole');
      assert.deepEqual(statement.Resource, { 'Fn::GetAtt': 'CloudFormationExecutionRole.Arn' });
      assert.equal(statement.Condition.StringEquals['iam:PassedToService'], 'cloudformation.amazonaws.com');
    }
  }
  const boundedRoles = execution.find(statement => statement.Sid === 'ManageBoundedApplicationRoles');
  assert.deepEqual(boundedRoles.Condition.ArnEquals, { 'iam:PermissionsBoundary': { 'Fn::Ref': 'ApplicationRoleBoundary' } });
  for (const action of ['iam:CreateRole', 'iam:PutRolePolicy', 'iam:PutRolePermissionsBoundary']) {
    const grants = execution.filter(statement => [statement.Action].flat().includes(action));
    assert.deepEqual(grants, [boundedRoles]);
  }
  const actions = new Set(execution.flatMap(statement => [statement.Action].flat()));
  for (const action of ['iam:DeleteRolePermissionsBoundary', 'iam:AttachRolePolicy', 'iam:CreatePolicyVersion', '*', 'iam:*']) {
    assert.ok(!actions.has(action), `execution role must not allow ${action}`);
  }
  const boundary = bootstrap.Resources.ApplicationRoleBoundary.Properties.PolicyDocument.Statement;
  assert.deepEqual(boundary.flatMap(statement => [statement.Action].flat()), [
    'logs:CreateLogStream', 'logs:PutLogEvents', 'lambda:InvokeFunctionUrl', 'lambda:InvokeFunction',
  ]);
  assert.equal(boundary[2].Condition.Bool['lambda:InvokedViaFunctionUrl'], true);
});

test('deployment artifacts stay private, encrypted, and require TLS', () => {
  const bucket = bootstrap.Resources.DeploymentBucket;
  assert.equal(bucket.DeletionPolicy, 'Retain');
  assert.equal(bucket.Properties.BucketEncryption.ServerSideEncryptionConfiguration[0].ServerSideEncryptionByDefault.SSEAlgorithm, 'AES256');
  assert.deepEqual(bucket.Properties.PublicAccessBlockConfiguration, {
    BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true,
  });
  const deny = bootstrap.Resources.DeploymentBucketPolicy.Properties.PolicyDocument.Statement[0];
  assert.equal(deny.Effect, 'Deny');
  assert.equal(deny.Principal, '*');
  assert.equal(deny.Action, 's3:*');
  assert.equal(deny.Condition.Bool['aws:SecureTransport'], false);
});
