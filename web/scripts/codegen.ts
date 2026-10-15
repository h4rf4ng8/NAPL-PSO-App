import { glob, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { codegen } from '@graphql-codegen/core';
import { plugin as operations } from '@graphql-codegen/typescript-operations';
import { plugin as typedDocumentNode } from '@graphql-codegen/typed-document-node';
import { concatAST, parse, validate } from 'graphql';
import { schema } from '../../api/routes/graphql/schema.ts';

const root = path.resolve(import.meta.dirname, '../..');
const outputPath = path.resolve(root, 'web/src/api/generated/graphql.ts');
const check = process.argv.includes('--check');
const allDocumentPaths = await Array.fromAsync(glob(path.resolve(root, 'web/src/**/*.graphql')));
const documentPaths = allDocumentPaths
  .toSorted((left, right) => left.localeCompare(right));
const documents = await Promise.all(documentPaths.map(async location => ({
  location,
  document: parse(await readFile(location, 'utf8')),
})));
const documentErrors = validate(schema, concatAST(documents.map(({ document }) => document)));
if (documentErrors.length > 0) throw new Error(documentErrors.map(error => error.message).join('\n'));

const generated = await codegen({
  filename: outputPath,
  schema,
  documents,
  config: {
    avoidOptionals: true,
    maybeValue: 'T | null',
    scalars: { JSON: 'unknown' },
    enumsAsTypes: true,
    useTypeImports: true,
    documentMode: 'documentNode',
  },
  plugins: [
    { 'typescript-operations': {} },
    { 'typed-document-node': {} },
  ],
  pluginMap: {
    'typescript-operations': { plugin: operations },
    'typed-document-node': { plugin: typedDocumentNode },
  },
});
const output = generated;

if (check) {
  let current;
  try { current = await readFile(outputPath, 'utf8'); } catch { current = undefined; }
  if (current !== output) {
    console.error('Generated GraphQL types are stale. Run npm run gql:generate.');
    process.exitCode = 1;
  }
} else {
  await mkdir(path.resolve(root, 'web/src/api/generated'), { recursive: true });
  await writeFile(outputPath, output);
}
