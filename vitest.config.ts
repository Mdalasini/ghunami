import { defineConfig } from 'vitest/config';

export default defineConfig({
	envDir: false,
	resolve: {
		tsconfigPaths: true
	},
	test: {
		setupFiles: ['./tests/setup/isolate-env.ts'],
		exclude: [
			'**/node_modules/**',
			'**/build/**',
			'**/dist/**',
			'**/.react-router/**',
			'**/tests/e2e/**',
			'**/*.spec.ts'
		],
		projects: [
			{
				extends: true,
				test: {
					name: 'node',
					environment: 'node',
					include: ['tests/unit/**/*.test.ts', 'tests/routes/**/*.test.ts']
				}
			},
			{
				extends: true,
				test: {
					name: 'convex',
					environment: 'edge-runtime',
					include: ['tests/convex/**/*.test.ts'],
					exclude: ['tests/convex/authFlow.test.ts'],
					server: { deps: { inline: ['convex-test'] } }
				}
			},
			{
				extends: true,
				test: {
					name: 'authFlow',
					environment: 'node',
					include: ['tests/convex/authFlow.test.ts'],
					server: { deps: { inline: ['convex-test'] } }
				}
			}
		]
	}
});
