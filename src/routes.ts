import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
	index('routes/home.tsx'),
	route('create', 'routes/create.tsx'),
	route('callback', 'routes/callback.tsx')
] satisfies RouteConfig;
