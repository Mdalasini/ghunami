import { redirect } from 'react-router';
import { clearedCookie } from '../lib/session.server';

export async function action() {
	return redirect('/', { headers: { 'Set-Cookie': clearedCookie() } });
}

export async function loader() {
	return redirect('/');
}
