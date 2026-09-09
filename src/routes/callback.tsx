import { HorizonMark } from '../components/Tip';

export function meta() {
	return [{ title: 'Signing in · Ghunami' }];
}

export default function Callback() {
	return (
		<div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper">
			<span
				className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-ink text-card"
				aria-hidden="true"
			>
				<HorizonMark className="h-6 w-auto" />
			</span>
			<p className="text-sm font-extrabold tracking-wider text-mute uppercase">Signing you in</p>
		</div>
	);
}
