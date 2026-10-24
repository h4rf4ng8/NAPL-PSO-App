/* eslint-disable unicorn/no-incorrect-template-string-interpolation -- Fixtures contain literal JSX expressions. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import ts from 'typescript';
import { migrateUi } from '../scripts/migrate-ui';

const filename = '/repo/web/src/features/example/View.tsx';
const parse = (source: string) => ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function checkParse(source: string) {
  assert.deepEqual((parse(source) as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics, []);
}

test('native controls and every table part retain handlers, props, children and surrounding source', () => {
  const original = `// keep this comment\nconst handler = () => save({ count: 2 });\nexport const View = () => <><button type="submit" disabled={busy} onClick={handler}>Save <strong>now</strong></button><input ref={ref} type="file" accept="image/*" onChange={read} /><textarea value={text} onChange={change}>{text}</textarea><table><caption>Players</caption><thead><tr><th scope="col">Name</th></tr></thead><tbody><tr><td>{name}</td></tr></tbody><tfoot><tr><td>Total</td></tr></tfoot></table><select><option>A</option></select></>;`;
  const result = migrateUi(original, filename);
  assert.match(result.source, /<Button type="submit" disabled=\{busy\} onClick=\{handler\}>Save <strong>now<\/strong><\/Button>/);
  assert.match(result.source, /<Input ref=\{ref\} type="file" accept="image\/\*" onChange=\{read\} \/>/);
  assert.match(result.source, /<Textarea value=\{text\} onChange=\{change\}>\{text\}<\/Textarea>/);
  assert.match(result.source, /<Table><TableCaption>Players<\/TableCaption><TableHeader><TableRow><TableHead scope="col">/);
  assert.match(result.source, /<TableBody><TableRow><TableCell>\{name\}/);
  assert.match(result.source, /<TableFooter><TableRow><TableCell>Total/);
  assert.ok(result.source.includes('const handler = () => save({ count: 2 });'));
  assert.ok(result.source.includes('<select><option>A</option></select>'));
  assert.match(result.source, /from '\.\.\/\.\.\/components\/ui\/button'/);
  assert.equal(migrateUi(result.source, filename).source, result.source);
  checkParse(result.source);
});

test('existing imports and aliases are reused; colliding identifiers receive safe imports', () => {
  const source = `import { Button as Action } from '../../components/ui/button';\nimport { Table } from '../../components/ui/table';\nconst Input = 1; const UiInput = 2;\nconst view = <><button /><input /><table><tbody><tr><td /></tr></tbody></table></>;`;
  const { source: output } = migrateUi(source, filename);
  assert.match(output, /<Action \/>/);
  assert.match(output, /import \{ Input as UiUiInput \}/);
  assert.match(output, /<UiUiInput \/>/);
  assert.equal((output.match(/components\/ui\/table/g) ?? []).length, 1);
  assert.match(output, /Table, TableBody, TableRow, TableCell/);
  assert.equal(migrateUi(output, filename).source, output);
  checkParse(output);
});

test('SVG artwork including foreignObject is byte-preserved by all passes', () => {
  const artwork = '<svg><foreignObject><button className="text-[9px] font-heading" style={{ color: C.cream }}>Artwork</button></foreignObject><path fill={C.gold} /></svg>';
  const { source } = migrateUi(`import { C } from '../../theme/theme'; const view = <>${artwork}<button /></>;`, filename, { palette: true, presentation: true });
  assert.ok(source.includes(artwork));
  assert.match(source, /import \{ C \}/);
  assert.match(source, /<Button \/>/);
});

test('palette pass maps exact imports and hex alpha templates without rewriting dynamic domain colors', () => {
  const original = "import { C, type ThemeMode } from '../../theme/theme';\nconst a = C.cream; const b = `${C.green}66`; const c = `1px solid ${C.navyLight}33`; const d = `linear-gradient(${C.brandNavy}, ${C.white}ff)`; const domain = `${team.color}22`;";
  const result = migrateUi(original, filename, { controls: false, palette: true });
  assert.match(result.source, /"hsl\(var\(--foreground\)\)"/);
  assert.match(result.source, /"hsl\(var\(--success\) \/ 0\.4\)"/);
  assert.match(result.source, /`1px solid \$\{"hsl\(var\(--border\) \/ 0\.2\)"\}`/);
  assert.match(result.source, /"hsl\(var\(--card\) \/ 1\)"/);
  assert.ok(result.source.includes('const domain = `${team.color}22`;'));
  assert.match(result.source, /import \{ type ThemeMode \}/);
  assert.equal(result.warnings.length, 0);
  assert.equal(migrateUi(result.source, filename, { controls: false, palette: true }).source, result.source);
  checkParse(result.source);
});

test('palette conditional alpha is retained and mixed runtime fallbacks remain untouched with a warning', () => {
  const original = "import { C as palette } from '../../theme/theme'; const a = `${active ? palette.green : palette.red}aa`; const b = `${team.color || palette.navyLight}33`; const c = palette.black;";
  const result = migrateUi(original, filename, { controls: false, palette: true });
  assert.match(result.source, /active \? "hsl\(var\(--success\) \/ 0\.6666666666666666\)" : "hsl\(var\(--destructive\) \/ 0\.6666666666666666\)"/);
  assert.ok(result.source.includes('const b = `${team.color || palette.navyLight}33`;'));
  assert.match(result.source, /"hsl\(var\(--overlay\)\)"/);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0]!, /retained mixed dynamic color/);
  assert.match(result.source, /import \{ C as palette \}/);
  checkParse(result.source);
});

test('binary hex alpha becomes CSS alpha rather than an invalid HSL suffix', () => {
  const original = "import { C } from '../../theme/theme'; const a = C.gold + '88'; const b = (active ? C.green : C.red) + 'FF'; const c = (team.color || C.navyLight) + '33';";
  const result = migrateUi(original, filename, { controls: false, palette: true });
  assert.match(result.source, /const a = "hsl\(var\(--warning\) \/ 0\.5333333333333333\)";/);
  assert.match(result.source, /const b = \(active \? "hsl\(var\(--success\) \/ 1\)" : "hsl\(var\(--destructive\) \/ 1\)"\);/);
  assert.ok(result.source.includes("const c = (team.color || C.navyLight) + '33';"));
  assert.equal(result.warnings.length, 1);
  checkParse(result.source);
});

test('presentation pass changes only class literals and is optional', () => {
  const original = `const untouched = "text-[9px] font-heading"; const view = <button className={active ? "text-[11px] font-heading tracking-widest" : \`text-[8px] font-body \${extra} tracking-[0.2em]\`}>Text</button>;`;
  assert.equal(migrateUi(original, filename, { controls: false }).source, original);
  const { source } = migrateUi(original, filename, { controls: false, presentation: true });
  assert.ok(source.includes('const untouched = "text-[9px] font-heading";'));
  assert.ok(source.includes('"text-xs font-semibold tracking-normal"'));
  assert.ok(source.includes('`text-xs font-sans ${extra} tracking-normal`'));
  checkParse(source);
});

test('unrelated C objects, strings, selects, and non-JSX property names stay unchanged', () => {
  const original = `const C = { cream: 'red' }; const button = '<button>'; const value = C.cream; const view = <select><option>{button}</option></select>;`;
  assert.equal(migrateUi(original, filename, { palette: true, presentation: true }).source, original);
  assert.throws(() => migrateUi('const view = <button>', filename), /invalid TSX/);
  assert.throws(() => migrateUi('<button />', '/repo/random.tsx'), /explicit src/);
});

test('CLI defaults to a dry run and writes only explicitly named targets with --write', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'napl-ui-codemod-'));
  try {
    const sourceDirectory = path.join(directory, 'src');
    await mkdir(sourceDirectory);
    const target = path.join(sourceDirectory, 'View.tsx');
    const sibling = path.join(sourceDirectory, 'Untouched.tsx');
    const original = 'export const View = () => <button>Save</button>;';
    await writeFile(target, original); await writeFile(sibling, original);
    const script = path.resolve(import.meta.dirname, '../scripts/migrate-ui.ts');
    const dryRun = spawnSync(process.execPath, ['--import', 'tsx', script, target], { encoding: 'utf8' });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /would update/);
    assert.equal(await readFile(target, 'utf8'), original);
    const write = spawnSync(process.execPath, ['--import', 'tsx', script, '--write', target], { encoding: 'utf8' });
    assert.equal(write.status, 0, write.stderr);
    assert.match(await readFile(target, 'utf8'), /<Button>Save<\/Button>/);
    assert.equal(await readFile(sibling, 'utf8'), original);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
