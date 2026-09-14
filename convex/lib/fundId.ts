/**
 * Short public fund identifiers. Case-sensitive [A-Za-z0-9]{3}.
 * 62³ = 238,328 values — identifiers, not secrets or authorization tokens.
 */
export const FUND_ID_PATTERN = /^[A-Za-z0-9]{3}$/;
export const FUND_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const FUND_ID_SPACE = FUND_ID_ALPHABET.length ** 3;
export const FUND_ID_ATTEMPTS = 8;

export function isFundID(value: string): boolean {
	return FUND_ID_PATTERN.test(value);
}

export function randomFundID(): string {
	const bytes = new Uint8Array(3);
	crypto.getRandomValues(bytes);
	let id = '';
	for (const byte of bytes) {
		id += FUND_ID_ALPHABET[byte % FUND_ID_ALPHABET.length];
	}
	return id;
}

export async function allocateFundID(
	isTaken: (id: string) => Promise<boolean>,
	generate: () => string = randomFundID
): Promise<string> {
	for (let i = 0; i < FUND_ID_ATTEMPTS; i++) {
		const fundID = generate();
		if (!isFundID(fundID)) continue;
		if (!(await isTaken(fundID))) return fundID;
	}
	throw new Error('Could not allocate a fund ID. Try again.');
}
