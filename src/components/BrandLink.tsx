import { Link } from 'react-router';
import logo from '../assets/logo.svg';

export function BrandLink() {
	return (
		<Link to="/" aria-label="ghunami — home">
			<img src={logo} alt="ghunami" className="h-8 w-auto" />
		</Link>
	);
}
