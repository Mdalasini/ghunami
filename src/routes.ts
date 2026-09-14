import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
	index('routes/home.tsx'),
	route('create', 'routes/create.tsx'),
	route('create/preview', 'routes/create.preview.tsx'),
	route('preview/:fundID', 'routes/preview.tsx'),
	route('f/:fundID/:slug?', 'routes/f.tsx'),
	route('funds', 'routes/funds.tsx'),
	route('media/:fundID', 'routes/media.fund.ts'),
	route('signin', 'routes/signin.tsx'),
	route('callback', 'routes/callback.tsx'),
	route('auth/token', 'routes/auth.token.ts'),
	route('auth/google', 'routes/auth.google.ts'),
	route('auth/signout', 'routes/auth.signout.ts')
] satisfies RouteConfig;
