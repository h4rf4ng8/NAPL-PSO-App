import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Change only account-directory calls to the imported REST page hook.
export function addPlayerPageSize(source: string, filename: string): string {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const diagnostics = (file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  if (diagnostics.length > 0) throw new Error(`Cannot migrate invalid TSX: ${filename}`);
  const names = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
      || !statement.moduleSpecifier.text.endsWith('/hooks/use-rest-page')) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) {
      if ((item.propertyName ?? item.name).text === 'useRestPage') names.add(item.name.text);
    }
  }
  const isAccountList = (node: ts.Node): boolean => ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node))
    && /^\/api\/accounts(?:\?|$)/.test(node.text)) || !!ts.forEachChild(node, isAccountList);
  const insertions: number[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.has(node.expression.text)
      && node.arguments.length === 1 && isAccountList(node.arguments[0]!)) insertions.push(node.arguments[0]!.end);
    ts.forEachChild(node, visit);
  };
  visit(file);
  const positions = insertions.toSorted((a, b) => b - a);
  for (const position of positions) source = `${source.slice(0, position)}, 50${source.slice(position)}`;
  return source;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const files = args.filter(arg => !arg.startsWith('--'));
  if (files.length === 0 || args.some(arg => arg.startsWith('--') && arg !== '--write')) throw new Error('Usage: player-page-size.ts [--write] FILE.tsx ...');
  for (const filename of files) {
    const source = await readFile(filename, 'utf8');
    const result = addPlayerPageSize(source, filename);
    if (write && source !== result) await writeFile(filename, result);
    console.log(`${source === result ? 'unchanged' : (write ? 'updated' : 'would update')} ${filename}`);
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
