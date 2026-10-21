import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ASL_LOGO_DIAMOND, ASL_LOGO_SRC } from '../src/assets/asl-logos';
import { ASLCrest, ASLLogoFull } from '../src/components/Branding';
import { AWARD_TYPES, AwardIcon, CaptainStar, ChampionTrophy } from '../src/components/Icons';

Object.assign(globalThis, { React });
const render = renderToStaticMarkup;

test('league artwork retains its hosted Storage URLs and branding defaults', () => {
  for (const [src, expected] of [
    [ASL_LOGO_SRC, '821ed843faad56ae844a6da3bfc551ea7a6c8ccb4cd0883ab24342a7fcff81a7'],
    [ASL_LOGO_DIAMOND, 'b1bd70b6215b0fc657e2c1d3f9b8e57deda43b6c2ac6fdf5d325f563465b025c'],
  ]) {
    assert.ok(src.endsWith(`/asl-assets/static/${expected}.png`));
  }
  const crest = render(React.createElement(ASLCrest));
  assert.ok(crest.includes('width="40" height="40"'));
  assert.ok(crest.includes('alt="ASL"'));
  assert.ok(render(React.createElement(ASLLogoFull)).includes('NORTH AMERICA PREMIER'));
  assert.ok(render(React.createElement(CaptainStar)).includes('aria-label="Team Captain"'));
});

test('repeated awards and trophies have unique, locally resolved gradients', () => {
  const elements = [0, 1].flatMap(copy => [
    ...AWARD_TYPES.map(award => React.createElement(AwardIcon, { key: `${copy}-${award.id}`, awardId: award.id })),
    React.createElement(ChampionTrophy, { key: `${copy}-gold` }),
    React.createElement(ChampionTrophy, { key: `${copy}-silver`, tone: 'silver' }),
  ]);
  const markup = render(React.createElement('div', null, elements));
  const ids = markup.matchAll(/id="([^"]+)"/g).map(match => match[1]).toArray();
  assert.equal(ids.length, 12);
  assert.equal(new Set(ids).size, ids.length);
  for (const [svg] of markup.matchAll(/<svg[\s\S]*?<\/svg>/g)) {
    const id = svg.match(/id="([^"]+)"/)?.[1];
    const references = svg.matchAll(/url\(#([^)]+)\)/g).map(match => match[1]).toArray();
    assert.ok(references.length > 0);
    assert.ok(references.every(reference => reference === id));
  }
  assert.equal(render(React.createElement(AwardIcon, { awardId: 'unknown' })), '');
  assert.ok(render(React.createElement(AwardIcon, { awardId: AWARD_TYPES[0].id })).includes('width="20" height="20"'));
  assert.ok(render(React.createElement(ChampionTrophy)).includes('width="24" height="28.799999999999997"'));
});
