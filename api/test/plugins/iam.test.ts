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

test('Function URL uses direct anonymous ingress and leaves CORS to Fastify', () => {
  const resources = template.Resources;
  assert.deepEqual(resources.ApiFunction.Properties.FunctionUrlConfig, { AuthType: 'NONE', InvokeMode: 'BUFFERED' });
  assert.equal(resources.ApiFunction.Properties.AutoPublishAlias, 'live');
  assert.equal(template.Outputs.FunctionUrl.Value['Fn::GetAtt'], 'ApiFunctionUrl.FunctionUrl');
  assert.equal(resources.VercelInvokeRole, undefined);
  assert.equal(resources.VercelOidcProvider, undefined);
  assert.deepEqual(resources.ApiRole.Properties.PermissionsBoundary, { 'Fn::Ref': 'RolePermissionsBoundaryArn' });
  for (const name of ['VercelTeamSlug', 'VercelProjectName', 'ExistingVercelOidcProviderArn', 'CookieKeys', 'OriginSecret', 'DiscordClientSecret']) assert.equal(template.Parameters[name], undefined);
  assert.deepEqual(resources.ApiFunction.Properties.ReservedConcurrentExecutions, [
    'HasReservedConcurrency', { 'Fn::Ref': 'ReservedConcurrency' }, { 'Fn::Ref': 'AWS::NoValue' },
  ]);
  assert.equal(template.Parameters.ReservedConcurrency.Default, -1);
  assert.equal(template.Parameters.FunctionMemorySize.Default, 512);
  assert.equal(template.Parameters.FunctionTimeout.Default, 60);
});

test('SAM keeps only the boundary deployment identity outside the Lambda environment', async () => {
  const script = await readFile(path.join(root, 'scripts/sam-env.mjs'), 'utf8');
  assert.match(script, /RolePermissionsBoundaryArn:\s*'APPLICATION_ROLE_BOUNDARY_ARN'/);
  assert.doesNotMatch(script, /VercelTeamSlug|VercelProjectName|ExistingVercelOidcProviderArn|COOKIE_KEYS|ORIGIN_SECRET/);
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
  assert.deepEqual(liveCheck.Action, ['lambda:GetFunctionUrlConfig', 'lambda:GetPolicy']);
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

test('both deployment identities can process exactly the application transforms', () => {
  const resources = template.Transform.map((transform: string) =>
    'arn:${AWS::Partition}:cloudformation:${AWS::Region}:aws:transform/' + transform.replace('AWS::', ''));
  for (const role of ['GitHubDeployRole', 'CloudFormationExecutionRole']) {
    const statements = bootstrap.Resources[role].Properties.Policies[0].PolicyDocument.Statement;
    const transforms = statements.find(statement => statement.Sid === 'UseApplicationTransforms');
    assert.equal(transforms.Effect, 'Allow');
    assert.equal(transforms.Action, 'cloudformation:CreateChangeSet');
    assert.deepEqual(new Set(transforms.Resource.map(resource => resource['Fn::Sub'])), new Set(resources));
  }
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
