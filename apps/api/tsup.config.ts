import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    migrate: 'src/db/migrate-cli.ts',
    seed: 'src/db/seed.ts',
  },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  clean: true,
  // The shared package ships TypeScript sources, so it is bundled into the API build.
  noExternal: ['@medical-ins/shared'],
});
