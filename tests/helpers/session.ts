/** Clearly labeled, nonsecret, test-only key. Never a real credential. */
export const TEST_SESSION_SECRET = 'ghunami-test-only-session-key-do-not-use!';

export function restoreEnv(name: string, previous: string | undefined) {
	if (previous === undefined) {
		delete process.env[name];
	} else {
		process.env[name] = previous;
	}
}
