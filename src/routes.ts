import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
	index('routes/home.tsx'),
	route('create', 'routes/create.tsx'),
	route('signin', 'routes/signin.tsx'),
	route('callback', 'routes/callback.tsx'),
	route('auth/token', 'routes/auth.token.ts'),
	route('auth/google', 'routes/auth.google.ts'),
	route('auth/signout', 'routes/auth.signout.ts')
] satisfies RouteConfig;
