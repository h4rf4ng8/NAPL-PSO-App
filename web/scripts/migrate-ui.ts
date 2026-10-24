import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const components: Record<string, [string, string]> = {
  button: ['button', 'Button'], input: ['input', 'Input'], textarea: ['textarea', 'Textarea'],
  table: ['table', 'Table'], thead: ['table', 'TableHeader'], tbody: ['table', 'TableBody'],
  tfoot: ['table', 'TableFooter'], tr: ['table', 'TableRow'], th: ['table', 'TableHead'],
  td: ['table', 'TableCell'], caption: ['table', 'TableCaption'],
};
const colors: Record<string, string> = {
  navy: 'card', white: 'card', navyDeep: 'background', navyLight: 'border', cream: 'foreground',
  green: 'success', greenLight: 'success', red: 'destructive', redLight: 'destructive',
  gold: 'warning', goldLight: 'warning', brandNavy: 'primary', brandNavyDeep: 'primary',
  onColor: 'primary-foreground', black: 'overlay',
};
interface Options { controls?: boolean; palette?: boolean; presentation?: boolean }
interface Edit { start: number; end: number; text: string }
const printer = ts.createPrinter();
const color = (key: string, alpha?: string) => `hsl(var(--${colors[key]})${alpha ? ` / ${Number.parseInt(alpha, 16) / 255}` : ''})`;

function applyEdits(source: string, edits: Edit[]): string {
  const sorted = edits.toSorted((a, b) => b.start - a.start || b.end - a.end);
  let boundary = source.length;
  for (const edit of sorted) {
    if (edit.end > boundary) throw new Error('Overlapping migration edits.');
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    boundary = edit.start;
  }
  return source;
}

function normalizeClasses(value: string): string {
  return value.replaceAll(/\btext-\[(?:8|9|10|11)px\]/g, 'text-xs')
    .replaceAll(/\bfont-(?:display|heading)\b/g, 'font-semibold')
    .replaceAll(/\bfont-body\b/g, 'font-sans')
    .replaceAll(/\btracking-(?:wider\b|widest\b|\[[^\]]+\])/g, 'tracking-normal');
}

// Target explicit TSX files under web/src; preserve original bytes outside changed AST spans.
export function migrateUi(source: string, filename: string, options: Options = {}) {
  const absolute = path.resolve(filename);
  const srcIndex = absolute.lastIndexOf(`${path.sep}src${path.sep}`);
  if (srcIndex === -1 || !filename.endsWith('.tsx')) throw new Error('Migration requires an explicit src/*.tsx file.');
  const file = ts.createSourceFile(absolute, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const diagnostics = (file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  if (diagnostics.length > 0) throw new Error(`Cannot migrate invalid TSX: ${filename}`);
  const imports = file.statements.filter(node => ts.isImportDeclaration(node));
  const paletteImport = imports.find(node => ts.isStringLiteral(node.moduleSpecifier)
    && /(?:^|\/)theme\/theme(?:\.tsx?)?$/.test(node.moduleSpecifier.text)
    && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
    && node.importClause.namedBindings.elements.some(item => (item.propertyName ?? item.name).text === 'C'));
  const paletteBinding = paletteImport?.importClause?.namedBindings;
  const paletteName = paletteBinding && ts.isNamedImports(paletteBinding)
    ? paletteBinding.elements.find(item => (item.propertyName ?? item.name).text === 'C')?.name.text : undefined;
  const edits: Edit[] = [];
  const warnings: string[] = [];
  const names = new Set<string>();
  const collectNames = (node: ts.Node) => { if (ts.isIdentifier(node)) names.add(node.text); ts.forEachChild(node, collectNames); };
  collectNames(file);
  const additions = new Map<string, Map<string, string>>();
  const aliases = new Map<string, string>();
  const replace = (start: number, end: number, text: string) => {
    if (source.slice(start, end) !== text) edits.push({ start, end, text });
  };
  const componentName = (tag: string) => {
    const [module, name] = components[tag]!;
    if (aliases.has(name)) return aliases.get(name)!;
    let specifier = path.relative(path.dirname(absolute), path.join(absolute.slice(0, srcIndex + 4), 'components/ui', module)).split(path.sep).join('/');
    if (!specifier.startsWith('.')) specifier = `./${specifier}`;
    const existing = imports.find(node => ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === specifier && !node.importClause?.isTypeOnly);
    const bindings = existing?.importClause?.namedBindings;
    const imported = bindings && ts.isNamedImports(bindings)
      ? bindings.elements.find(item => !item.isTypeOnly && (item.propertyName ?? item.name).text === name) : undefined;
    let local = imported?.name.text ?? name;
    if (!imported) {
      while (names.has(local)) local = `Ui${local}`;
      names.add(local);
      if (!additions.has(specifier)) additions.set(specifier, new Map());
      additions.get(specifier)!.set(name, local);
    }
    aliases.set(name, local);
    return local;
  };
  const paletteKey = (node: ts.Node): string | undefined => ts.isPropertyAccessExpression(node)
    && ts.isIdentifier(node.expression) && node.expression.text === paletteName && Object.hasOwn(colors, node.name.text) ? node.name.text : undefined;
  const isPaletteColor = (node: ts.Expression): boolean => !!paletteKey(node)
    || (ts.isParenthesizedExpression(node) && isPaletteColor(node.expression))
    || (ts.isConditionalExpression(node) && isPaletteColor(node.whenTrue) && isPaletteColor(node.whenFalse));
  const containsPalette = (node: ts.Node): boolean => !!paletteKey(node) || !!ts.forEachChild(node, containsPalette);
  const replacePalette = (node: ts.Node, alpha?: string) => {
    const key = paletteKey(node);
    if (key) replace(node.getStart(file), node.end, JSON.stringify(color(key, alpha)));
    else ts.forEachChild(node, child => replacePalette(child, alpha));
  };
  const classLiteral = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      replace(node.getStart(file) + 1, node.end - 1, normalizeClasses(source.slice(node.getStart(file) + 1, node.end - 1)));
    } else if (ts.isTemplateExpression(node)) {
      for (const literal of [node.head, ...node.templateSpans.map(span => span.literal)]) {
        const end = literal.end - (literal.kind === ts.SyntaxKind.TemplateTail ? 1 : 2);
        replace(literal.getStart(file) + 1, end, normalizeClasses(source.slice(literal.getStart(file) + 1, end)));
      }
    } else if (ts.isConditionalExpression(node)) {
      classLiteral(node.whenTrue); classLiteral(node.whenFalse);
    } else if (ts.isParenthesizedExpression(node)) classLiteral(node.expression);
  };
  const visit = (node: ts.Node) => {
    if ((ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === 'svg')
      || (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === 'svg') || ts.isImportDeclaration(node)) return;
    if (options.controls !== false && (ts.isJsxOpeningElement(node) || ts.isJsxClosingElement(node) || ts.isJsxSelfClosingElement(node))
      && ts.isIdentifier(node.tagName) && Object.hasOwn(components, node.tagName.text)) {
      replace(node.tagName.getStart(file), node.tagName.end, componentName(node.tagName.text));
    }
    if (options.presentation && ts.isJsxAttribute(node) && node.name.getText(file) === 'className' && node.initializer) {
      classLiteral(ts.isJsxExpression(node.initializer) ? node.initializer.expression ?? node.initializer : node.initializer);
    }
    if (paletteName && options.palette) {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken
        && ts.isStringLiteral(node.right) && /^[\da-f]{2}$/i.test(node.right.text) && containsPalette(node.left)) {
        if (isPaletteColor(node.left)) {
          replacePalette(node.left, node.right.text);
          replace(node.left.end, node.end, '');
        } else {
          const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
          warnings.push(`${filename}:${line + 1}: retained mixed dynamic color with hex alpha for manual review`);
        }
        return;
      }
      if (ts.isTemplateExpression(node)) {
        for (const span of node.templateSpans) {
          const suffix = span.literal.text.match(/^[\da-f]{2}(?![\da-f])/i)?.[0];
          if (suffix && containsPalette(span.expression)) {
            if (isPaletteColor(span.expression)) {
              replacePalette(span.expression, suffix);
              replace(span.literal.getStart(file) + 1, span.literal.getStart(file) + 3, '');
            } else {
              const { line } = file.getLineAndCharacterOfPosition(span.expression.getStart(file));
              warnings.push(`${filename}:${line + 1}: retained mixed dynamic color with hex alpha for manual review`);
            }
          } else visit(span.expression);
        }
        return;
      }
      const key = paletteKey(node);
      if (key) { replace(node.getStart(file), node.end, JSON.stringify(color(key))); return; }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  const newImports: string[] = [];
  for (const [specifier, required] of additions) {
    const declaration = imports.find(node => ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === specifier
      && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && !node.importClause.isTypeOnly);
    const entries = [...required].map(([name, local]) => ts.factory.createImportSpecifier(false, name === local ? undefined : ts.factory.createIdentifier(name), ts.factory.createIdentifier(local)));
    if (declaration?.importClause && declaration.importClause.namedBindings && ts.isNamedImports(declaration.importClause.namedBindings)) {
      const clause = ts.factory.updateImportClause(declaration.importClause, false, declaration.importClause.name,
        ts.factory.updateNamedImports(declaration.importClause.namedBindings, [...declaration.importClause.namedBindings.elements, ...entries]));
      replace(declaration.getStart(file), declaration.end, printer.printNode(ts.EmitHint.Unspecified, ts.factory.updateImportDeclaration(declaration, declaration.modifiers, clause, declaration.moduleSpecifier, declaration.attributes), file));
    } else newImports.push(`import { ${[...required].map(([name, local]) => name === local ? name : `${name} as ${local}`).join(', ')} } from '${specifier}';`);
  }
  if (newImports.length > 0) {
    const position = imports.at(-1)?.end ?? 0;
    replace(position, position, `${position ? '\n' : ''}${newImports.join('\n')}\n`);
  }
  let output = applyEdits(source, edits);
  if (paletteName && options.palette) output = removeUnusedPaletteImport(output, absolute, paletteName);
  return { source: output, changes: edits.length, warnings };
}

function removeUnusedPaletteImport(source: string, filename: string, name: string): string {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const used = (node: ts.Node): boolean => !ts.isImportDeclaration(node)
    && ((ts.isIdentifier(node) && node.text === name) || !!ts.forEachChild(node, used));
  if (ts.forEachChild(file, used)) return source;
  const edits: Edit[] = [];
  for (const declaration of file.statements) {
    if (!ts.isImportDeclaration(declaration)) continue;
    const clause = declaration.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    const remaining = clause.namedBindings.elements.filter(item => item.name.text !== name);
    if (remaining.length === clause.namedBindings.elements.length) continue;
    const updated = remaining.length > 0 || clause.name ? ts.factory.updateImportDeclaration(declaration, declaration.modifiers,
      ts.factory.updateImportClause(clause, clause.isTypeOnly, clause.name, remaining.length > 0 ? ts.factory.updateNamedImports(clause.namedBindings, remaining) : undefined), declaration.moduleSpecifier, declaration.attributes) : undefined;
    edits.push({ start: declaration.getStart(file), end: declaration.end, text: updated ? printer.printNode(ts.EmitHint.Unspecified, updated, file) : '' });
  }
  return applyEdits(source, edits);
}

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter(arg => arg.startsWith('--')));
  const files = args.filter(arg => !arg.startsWith('--'));
  if (files.length === 0 || [...flags].some(flag => !['--write', '--dry-run', '--palette', '--presentation', '--no-controls'].includes(flag))
    || (flags.has('--write') && flags.has('--dry-run'))) {
    throw new Error('Usage: migrate-ui.ts [--write | --dry-run] [--palette] [--presentation] [--no-controls] FILE.tsx ...');
  }
  for (const filename of files) {
    const before = await readFile(filename, 'utf8');
    const result = migrateUi(before, filename, { controls: !flags.has('--no-controls'), palette: flags.has('--palette'), presentation: flags.has('--presentation') });
    if (result.source !== before && flags.has('--write')) await writeFile(filename, result.source);
    console.log(`${result.source === before ? 'unchanged' : (flags.has('--write') ? 'updated' : 'would update')} ${filename} (${result.changes} edits)`);
    for (const warning of result.warnings) console.warn(warning);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
