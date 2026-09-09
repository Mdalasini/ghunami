import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * The signed-in session, sealed into an httpOnly cookie. The refresh token is
 * the reason this is encrypted rather than merely signed: a signed cookie is
 * still readable, and nothing in the browser needs to read this.
 */
export type Session = {
	accessToken: string;
	refreshToken: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
};

const COOKIE = 'gh_session';
const MAX_AGE = 60 * 60 * 24 * 30;

function key(): Buffer {
	const secret = process.env.SESSION_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error(
			'SESSION_SECRET must be set to at least 32 characters. Generate one with `openssl rand -base64 32`.'
		);
	}
	return createHash('sha256').update(secret).digest();
}

function seal(session: Session): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	const body = Buffer.concat([
		cipher.update(JSON.stringify(session), 'utf8'),
		cipher.final()
	]);
	return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

function unseal(sealed: string): Session | null {
	try {
		const raw = Buffer.from(sealed, 'base64url');
		if (raw.length < 29) return null;
		const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
		decipher.setAuthTag(raw.subarray(12, 28));
		const json = Buffer.concat([
			decipher.update(raw.subarray(28)),
			decipher.final()
		]).toString('utf8');
		return JSON.parse(json) as Session;
	} catch {
		// Tampered, truncated, or sealed under a rotated secret. Treat as signed out.
		return null;
	}
}

export function readSession(request: Request): Session | null {
	const header = request.headers.get('cookie');
	if (!header) return null;
	for (const part of header.split(';')) {
		const [name, ...rest] = part.trim().split('=');
		if (name === COOKIE) {
			return unseal(rest.join('='));
		}
	}
	return null;
}

function serialize(value: string, maxAge: number): string {
	const attrs = [
		`${COOKIE}=${value}`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		`Max-Age=${maxAge}`
	];
	if (process.env.NODE_ENV === 'production') {
		attrs.push('Secure');
	}
	return attrs.join('; ');
}

export function sessionCookie(session: Session): string {
	return serialize(seal(session), MAX_AGE);
}

export function clearedCookie(): string {
	return serialize('', 0);
}
