import assert from 'node:assert/strict';
import test from 'node:test';
import * as contracts from '@napl/contracts';
import { imageUploadInput, imageUploadResponse } from '@napl/contracts/storage';
import { createApp } from '../helper.js';
import { payloadFixture } from '../payload-fixture.js';
import { assertInventory, inventory, contractClient, specification, compileSchema, requestComponent, dereference, type OpenApiNode } from '../openapi.js';
test('OpenAPI inventories actual registrations and compiles schemas', async t => {
  const { db } = payloadFixture(), app = createApp({ db, verify: async id => ({ id, sessionId: id, claims: {} }) });
  t.after(() => app.close());
  const registered = inventory(app); await app.ready(); assertInventory(registered);
  await contractClient(app).exchange('OPTIONS', '/{corsPath}', '/api/accounts', { headers: { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization,Content-Type,Apollo-Require-Preflight' } }, 204);
  for (const [name, schema] of Object.entries(specification.components.schemas)) assert.doesNotThrow(() => compileSchema(schema), name);
  const sources = { CoreProfilePatch: contracts.profilePatch, CoreAdminAccountPatch: contracts.adminAccountPatch, CoreTeamInput: contracts.teamInput, CoreTeamPatch: contracts.teamPatch,
    ContentNewsInput: contracts.newsInput, ContentNewsPatch: contracts.newsInput.omit({ id: true }).partial(), ContentRuleInput: contracts.ruleInput, ContentRulePatch: contracts.ruleInput.omit({ id: true }).partial(),
    ContentArticleInput: contracts.articleInput, ContentArticlePatch: contracts.articleInput.omit({ id: true }).partial(), ContentScheduleInput: contracts.scheduleInput, ContentSchedulePatch: contracts.scheduleInput.omit({ id: true }).partial(),
    ContentTransferInput: contracts.transferInput, ContentSubmissionInput: contracts.submissionInput, ContentSubmissionReviewInput: contracts.approveSubmission, ContentPeriodInput: contracts.periodInput, ContentPeriodPatch: contracts.periodPatch, ContentBallotInput: contracts.voteInput, StorageUploadRequest: imageUploadInput, StorageUploadResponse: imageUploadResponse };
  for (const [name, source] of Object.entries(sources)) {
    const body = requestComponent(name, source);
    assert.deepEqual(specification.components.schemas[name], body, `${name} drifted from its runtime Zod source`);
  }
  assert.deepEqual(specification.paths['/api/graphql'].post['x-operation-names'], [...contracts.graphqlOperationNames].toSorted((a, b) => a.localeCompare(b)));
  assert.equal(specification.paths['/api/graphql'].post.requestBody.content['application/json'].schema.oneOf.length, 21);
  const pending: unknown[] = [specification];
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    if ('$ref' in value) assert.doesNotThrow(() => dereference(value));
    pending.push(...Object.values(value));
  }
  const ids = Object.values(specification.paths).flatMap(item => Object.values(item as OpenApiNode).filter(value => value && typeof value === 'object' && value.operationId).map(value => value.operationId));
  assert.equal(ids.length, new Set(ids).size, 'operation IDs must be unique');
});
