/// <reference types="vite/client" />

/**
 * In-process Convex modules for convex-test. `authFlow.ts` is a Node action that
 * constructs a WorkOS client, so it is excluded: these tests never talk to WorkOS.
 */
export const modules = import.meta.glob([
	'../../convex/**/*.ts',
	'../../convex/_generated/**',
	'!../../convex/authFlow.ts',
	'!../../convex/**/*.test.ts'
]);
