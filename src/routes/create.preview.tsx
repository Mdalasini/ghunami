import { redirect } from 'react-router';

export function loader() {
	return redirect('/create');
}

export default function LegacyPreviewRedirect() {
	return null;
}
