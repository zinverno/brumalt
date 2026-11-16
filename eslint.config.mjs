import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
  globalIgnores(['node_modules/**', 'dist/**', '.test-build/**', 'tests/**', 'scripts/**', 'main.js', 'esbuild.config.mjs']),
  ...obsidianmd.configs.recommended,
  { languageOptions: { parserOptions: { projectService: { allowDefaultProject: ['eslint.config.mjs'] } } } },
]);
