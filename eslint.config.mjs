import typescriptEslint from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-plugin-prettier';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '*.js', '*.mjs'],
  },
  ...compat.extends(
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ),
  {
    files: ['src/**/*.ts'],
    plugins: {
      '@typescript-eslint': typescriptEslint,
      prettier,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: 'tsconfig.json',
      },
    },
    rules: {
      // TypeScript specific
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Strict boolean expressions - set to warn for now, can be made stricter later
      '@typescript-eslint/strict-boolean-expressions': [
        'warn',
        {
          allowNullableObject: true,
          allowNullableBoolean: true,
          allowNullableString: true,
          allowNullableNumber: true,
          allowAny: true,
        },
      ],

      // General
      eqeqeq: ['error', 'smart'],
      'no-console': 'off',
      'no-return-await': 'error',
      'no-unneeded-ternary': 'error',
      'no-unused-vars': 'off',

      // Prettier
      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto',
        },
      ],
    },
  },
];
