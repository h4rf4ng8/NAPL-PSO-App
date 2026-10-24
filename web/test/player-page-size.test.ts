import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addPlayerPageSize } from '../scripts/player-page-size';

const imported = "import { useRestPage } from '../../hooks/use-rest-page';\n";
test('account page codemod preserves expressions and changes only imported list calls', () => {
  const calls = [
    "useRestPage<Account>('/api/accounts')",
    "useRestPage<Account>('/api/accounts?search=' + encodeURIComponent(search))",
    'useRestPage<Account>(`/api/accounts?search=${segment(search)}`)',
    'useRestPage<Account>(open ? `/api/accounts?search=${segment(search)}` : null)',
  ];
  for (const call of calls) {
    const before = `${imported}const page = ${call};\nconst onClick = () => submit({ id, selected });`;
    const expected = before.replace(`${call};`, () => `${call.slice(0, -1)}, 50);`);
    assert.equal(addPlayerPageSize(before, 'src/example.tsx'), expected);
    assert.equal(addPlayerPageSize(expected, 'src/example.tsx'), expected);
  }
});
test('account page codemod skips other resources, explicit sizes, and unrelated functions', () => {
  for (const call of ["useRestPage('/api/teams')", "useRestPage('/api/accounts/player-id')", "useRestPage('/api/accounts', 25)"]) {
    assert.equal(addPlayerPageSize(imported + call, 'src/example.tsx'), imported + call);
  }
  assert.equal(addPlayerPageSize("useRestPage('/api/accounts')", 'src/example.tsx'), "useRestPage('/api/accounts')");
  const alias = "import { useRestPage as usePage } from '../../hooks/use-rest-page';\nusePage('/api/accounts');";
  assert.equal(addPlayerPageSize(alias, 'src/example.tsx'), alias.replace("('/api/accounts')", "('/api/accounts', 50)"));
});
