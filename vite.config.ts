import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	envDir: process.env.GHUNAMI_ISOLATED_TEST === '1' ? false : undefined,
	plugins: [tailwindcss(), reactRouter()],
	resolve: {
		tsconfigPaths: true
	}
});
