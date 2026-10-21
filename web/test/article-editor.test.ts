import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ArticleDetailView } from '../src/features/content/Articles';
import type { Account } from '../src/api/models';
import { login, clearSession, apiPath, tick } from './auth-fixture';

Object.assign(globalThis, { React });
after(() => { Reflect.deleteProperty(globalThis, 'React'); });
afterEach(clearSession);
for (const coverImageUrl of ['https://expired.example/old.png', '/api/media/articles/article/cover?v=1']) {
  test('an unchanged or removed cover remains editable without importing it: ' + coverImageUrl, async () => {
    const article = { id: 'article', title: 'Original', slug: 'article', body: 'Full body', excerpt: 'Excerpt', author: 'Admin', publishedAt: 1, coverImageUrl };
    const writes: Record<string, unknown>[] = [];
    await login(async (url, init) => {
      const path = apiPath(url);
      if (path === '/api/articles' && init?.method === 'POST') { writes.push(JSON.parse(String(init.body))); return Response.json({ ok: true }); }
      if (path.startsWith('/api/media/')) return Response.json({ externalUrl: 'https://storage.example/signed' });
      assert.equal(path, '/api/articles/slug/article');
      return Response.json(article);
    });
    let view: ReactTestRenderer;
    await act(async () => { view = create(React.createElement(ArticleDetailView, { slug: 'article', account: { roles: ['admin'] } as Account, onBack() {} })); await tick(); });
    const button = (label: string) => view!.root.findAllByType('button').find(node => node.children.join('') === label)!;
    await act(async () => { button('EDIT').props.onClick(); });
    await act(async () => { view!.root.findAllByType('input').find(node => node.props.value === 'Original')!.props.onChange({ target: { value: 'Changed title' } }); });
    await act(async () => { await button('SAVE CHANGES').props.onClick(); await tick(); });
    assert.equal(writes[0]!.title, 'Changed title');
    assert.equal(Object.hasOwn(writes[0]!, 'coverImageUrl'), false);
    await act(async () => { button('EDIT').props.onClick(); });
    await act(async () => { button('Remove cover image').props.onClick(); });
    await act(async () => { await button('SAVE CHANGES').props.onClick(); await tick(); });
    assert.equal(writes[1]!.coverImageUrl, null);
    act(() => view!.unmount());
  });
}
