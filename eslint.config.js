import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.output/**',
      '**/.astro/**',
      '**/.wrangler/**',
      '**/.wxt/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // tsconfig.eslint.json (et non le service par défaut) : les tests et les fichiers
        // de config sont hors des projets de build, qui ne doivent pas les émettre.
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Les identifiants préfixés d'un underscore sont volontairement inutilisés.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `import type` explicite : le code publié doit être sûr sous verbatimModuleSyntax.
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
    },
  },
  {
    // Paquets publiés sur npm : aucune dépendance runtime interne non publiée (§4.1).
    files: ['packages/core/src/**/*.ts', 'packages/sync/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@calmcut/watermark', '@calmcut/db', '**/watermark/**', '**/db/**'],
              message:
                'Un paquet publié sur npm ne peut pas importer watermark ni db (§4.1). ' +
                'Déplace le code partagé dans @calmcut/core.',
            },
          ],
        },
      ],
    },
  },
  {
    // AudioWorklet : ce fichier est servi tel quel au thread audio, jamais bundlé.
    // Ses globales n'existent que dans l'AudioWorkletGlobalScope.
    files: ['apps/*/public/*-processor.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        AudioWorkletProcessor: 'readonly',
        registerProcessor: 'readonly',
        currentTime: 'readonly',
        currentFrame: 'readonly',
        sampleRate: 'readonly',
      },
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
)
