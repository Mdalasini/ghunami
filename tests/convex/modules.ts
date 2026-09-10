/// <reference types="vite/client" />

/**
 * In-process Convex modules for convex-test. Edge-runtime tests omit `authFlow.ts`
 * (Node + WorkOS). Node tests that mock WorkOS use `authFlowModules`.
 */
export const modules = import.meta.glob([
	'../../convex/**/*.ts',
	'../../convex/_generated/**',
	'!../../convex/authFlow.ts',
	'!../../convex/**/*.test.ts'
]);

export const authFlowModules = import.meta.glob([
	'../../convex/**/*.ts',
	'../../convex/_generated/**',
	'!../../convex/**/*.test.ts'
]);
