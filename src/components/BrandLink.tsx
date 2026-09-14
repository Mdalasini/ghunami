import type { ReactNode } from 'react';
import { Link } from 'react-router';
import logo from '../assets/logo.svg';

export function BrandLink() {
	return (
		<Link to="/" aria-label="ghunami — home">
			<img src={logo} alt="ghunami" className="h-8 w-auto" />
		</Link>
	);
}

export function SiteHeader({
	brand = true,
	children
}: {
	brand?: boolean;
	children?: ReactNode;
}) {
	return (
		<header
			className={`flex items-start gap-4 px-6 py-8 md:px-12 ${brand ? 'justify-between' : 'justify-end'}`}
		>
			{brand ? <BrandLink /> : null}
			{children ? <div className="flex h-8 items-center">{children}</div> : null}
		</header>
	);
}
