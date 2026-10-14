import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import ts from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/node_modules/**', '**/dist/**', '**/generated/**', '**/coverage/**', '**/.build/**', '**/.vercel/**']),
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    extends: [js.configs.recommended, unicorn.configs.recommended],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // Short domain names such as app, db, req and res are deliberate in this project.
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/name-replacements': 'off',
      'unicorn/consistent-boolean-name': 'off',
      // Null is part of the PostgreSQL and public JSON contracts.
      'unicorn/no-null': 'off',
      // Nested Zod schemas retain their data shape; public class methods stay above private helpers.
      'unicorn/max-nested-calls': 'off',
      'unicorn/consistent-class-member-order': 'off',
      'unicorn/filename-case': ['error', { cases: { kebabCase: true, pascalCase: true } }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [ts.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: {
      // React handlers conventionally pass setter references and use undefined for empty props.
      'unicorn/no-array-callback-reference': 'off',
    },
  },
  {
    files: ['web/src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: ['../../api', '../../api/index', '../../api/models', '../../../api', '../../../api/index', '../../../api/models'].map(name => ({
          name,
          message: 'Import the owning feature API or models directly; shared API code is transport only.',
        })),
      }],
    },
  },
  {
    files: ['**/test/**/*.{ts,mjs}'],
    rules: {
      // Direct response assertions keep the expected result beside the request being tested.
      'unicorn/no-await-expression-member': 'off',
    },
  },
  {
    files: ['web/src/{features,components}/**/*.tsx'],
    rules: {
      // Preserve the migrated UI's iteration and callback style while retaining correctness checks.
      'unicorn/no-array-sort': 'off',
      'unicorn/no-for-each': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/no-computed-property-existence-check': 'off',
      'unicorn/no-declarations-before-early-exit': 'off',
      'unicorn/no-unreadable-for-of-expression': 'off',
    },
  },
  {
    files: ['**/*.config.{js,ts}'],
    // Framework configuration files intentionally evaluate their defineConfig entry point.
    rules: { 'unicorn/no-top-level-side-effects': 'off' },
  },
]);
