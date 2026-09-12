export function CoverImage({
	src,
	alt,
	className = ''
}: {
	src: string;
	alt: string;
	className?: string;
}) {
	return (
		<div className={`aspect-[4/5] overflow-hidden ${className}`.trim()}>
			<img src={src} alt={alt} className="h-full w-full object-cover" />
		</div>
	);
}
