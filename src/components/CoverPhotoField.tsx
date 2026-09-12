import {
	type ChangeEvent,
	type DragEvent,
	type Ref,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
	lazy,
	Suspense
} from 'react';
import type { Area, Point } from 'react-easy-crop';
import {
	COVER_ACCEPT,
	COVER_ASPECT,
	COVER_MESSAGES,
	assessCropResolution,
	decodeCoverImage,
	percentCropToPixels,
	maxCoverZoom,
	processCoverCrop,
	releaseDecodedCover,
	validateCoverFile,
	type CropQuality,
	type DecodedCover
} from '../lib/coverImage';
import { setCover } from '../lib/draft';
import { CoverImage } from './CoverImage';

const Cropper = lazy(() => import('react-easy-crop'));

export type CoverPhotoFieldHandle = {
	confirm: () => Promise<boolean>;
};

export function CoverPhotoField({
	coverUrl,
	ref,
	onReadyChange,
	onCroppingChange
}: {
	coverUrl: string;
	ref?: Ref<CoverPhotoFieldHandle>;
	onReadyChange: (ready: boolean) => void;
	onCroppingChange?: (cropping: boolean) => void;
}) {
	const cropCard = useRef<HTMLDivElement>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const cropViewport = useRef<HTMLDivElement>(null);
	const [cropSize, setCropSize] = useState<{ width: number; height: number }>();
	const decodedRef = useRef<DecodedCover | null>(null);
	const cropPercentRef = useRef<Area | null>(null);
	const confirmRef = useRef<() => Promise<boolean>>(async () => false);
	const loadIdRef = useRef(0);
	const [dragging, setDragging] = useState(false);
	const [client, setClient] = useState(false);
	const [pending, setPending] = useState<DecodedCover | null>(null);
	const [fileName, setFileName] = useState('');
	const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
	const [zoom, setZoom] = useState(1);
	const [cropQuality, setCropQuality] = useState<CropQuality | null>(null);
	const [error, setError] = useState('');
	const [warning, setWarning] = useState('');
	const [reading, setReading] = useState(false);
	const [processing, setProcessing] = useState(false);
	const maxZoom = pending ? maxCoverZoom(pending.width, pending.height) : 1;
	const changeZoom = (value: number) => setZoom(Math.max(1, Math.min(maxZoom, value)));

	useEffect(() => {
		const viewport = cropViewport.current;
		if (!viewport) return;
		const measure = () => {
			setCropSize({ width: viewport.clientWidth, height: viewport.clientHeight });
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(viewport);
		return () => observer.disconnect();
	}, [pending]);

	useEffect(() => {
		setClient(true);
	}, []);

	useEffect(() => {
		onCroppingChange?.(Boolean(pending));
		return () => {
			onCroppingChange?.(false);
		};
	}, [pending, onCroppingChange]);

	useEffect(() => {
		return () => {
			loadIdRef.current += 1;
			releaseDecodedCover(decodedRef.current);
			decodedRef.current = null;
		};
	}, []);

	const publishReady = useCallback(
		(ready: boolean) => {
			onReadyChange(ready);
		},
		[onReadyChange]
	);

	useEffect(() => {
		if (pending) {
			publishReady(cropQuality !== null && cropQuality !== 'too_small' && !reading && !processing);
			return;
		}
		publishReady(coverUrl !== '' && !reading && !processing);
	}, [pending, cropQuality, coverUrl, reading, processing, publishReady]);

	function replacePending(next: DecodedCover | null) {
		releaseDecodedCover(decodedRef.current);
		decodedRef.current = next;
		setPending(next);
	}

	function resetCrop() {
		setCrop({ x: 0, y: 0 });
		setZoom(1);
		cropPercentRef.current = null;
		setCropQuality(null);
	}

	async function acceptFile(file: File | undefined) {
		if (!file) return;

		const loadId = loadIdRef.current + 1;
		loadIdRef.current = loadId;
		setError('');
		setWarning('');

		const check = validateCoverFile(file);
		if (!check.ok) {
			setError(check.error);
			setReading(false);
			return;
		}

		setReading(true);
		resetCrop();
		try {
			const decoded = await decodeCoverImage(file);
			if (loadId !== loadIdRef.current) {
				releaseDecodedCover(decoded);
				return;
			}
			replacePending(decoded);
			setFileName(file.name);
			setWarning('');
			requestAnimationFrame(() => {
				cropCard.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
			});
		} catch (caught) {
			if (loadId !== loadIdRef.current) return;
			replacePending(null);
			setFileName('');
			setError(caught instanceof Error ? caught.message : COVER_MESSAGES.unreadable);
		} finally {
			if (loadId === loadIdRef.current) {
				setReading(false);
			}
		}
	}

	function onFileChange(event: ChangeEvent<HTMLInputElement>) {
		void acceptFile(event.currentTarget.files?.[0]);
		event.currentTarget.value = '';
	}

	function onDrop(event: DragEvent<HTMLDivElement>) {
		event.preventDefault();
		setDragging(false);
		void acceptFile(event.dataTransfer.files[0]);
	}

	function onCropComplete(croppedArea: Area) {
		// Percentages are of the original bitmap. Do not use croppedAreaPixels from
		// the cropper — those are measured against the downscaled preview image.
		cropPercentRef.current = croppedArea;
		const decoded = decodedRef.current;
		if (!decoded) return;
		const pixels = percentCropToPixels(croppedArea, decoded.width, decoded.height);
		const quality = assessCropResolution(pixels.width, pixels.height);
		setCropQuality(quality);
		if (quality === 'too_small') {
			setError(COVER_MESSAGES.tooSmall);
			setWarning('');
			return;
		}
		setError('');
		setWarning(quality === 'soft' ? COVER_MESSAGES.soft : '');
	}

	function cancelPending() {
		replacePending(null);
		setFileName('');
		resetCrop();
		setError('');
		setWarning('');
	}

	async function confirm() {
		if (processing || reading) return false;
		const decoded = decodedRef.current;
		const cropPercent = cropPercentRef.current;
		if (!decoded || !cropPercent) {
			return coverUrl !== '';
		}

		const pixels = percentCropToPixels(cropPercent, decoded.width, decoded.height);
		const quality = assessCropResolution(pixels.width, pixels.height);
		if (quality === 'too_small') {
			setError(COVER_MESSAGES.tooSmall);
			setWarning('');
			return false;
		}

		setProcessing(true);
		try {
			const { file } = await processCoverCrop(decoded.bitmap, cropPercent, fileName);
			setCover(file);
			setWarning(quality === 'soft' ? COVER_MESSAGES.soft : '');
			replacePending(null);
			resetCrop();
			setError('');
			return true;
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : COVER_MESSAGES.encodeFailed);
			return false;
		} finally {
			setProcessing(false);
		}
	}

	confirmRef.current = confirm;
	useImperativeHandle(ref, () => ({
		confirm: () => confirmRef.current()
	}));

	const showCropper = Boolean(pending);
	const helper = showCropper
		? 'Drag to reposition · zoom is limited to preserve photo quality'
		: 'or drop one here · JPG, PNG, HEIC, WebP · up to 25 MB';

	return (
		<>
			<input
				ref={fileInput}
				className="sr-only"
				type="file"
				accept={COVER_ACCEPT}
				onChange={onFileChange}
			/>
			<div
				ref={cropCard}
				className={`compose-card ml-15 overflow-hidden rounded-3xl rounded-tr-lg border-2 bg-card transition-colors duration-150 ${
					dragging ? 'border-accent' : 'border-line'
				}`}
				role="presentation"
				onDragOver={(event) => {
					event.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={onDrop}
			>
				{showCropper && pending ? (
					<div className="relative">
						<div
							ref={cropViewport}
							className="relative w-full overflow-hidden bg-ink"
							style={{ aspectRatio: COVER_ASPECT }}
												>
							{client && cropSize ? (
								<Suspense
									fallback={
										<img
											src={pending.previewUrl}
											alt="Photo to crop"
											className="h-full w-full object-cover"
										/>
									}
								>
									<Cropper
										image={pending.previewUrl}
										crop={crop}
										zoom={zoom}
										rotation={0}
										minZoom={1}
										maxZoom={maxZoom}
																				cropSize={cropSize}
										aspect={COVER_ASPECT}
										cropShape="rect"
										zoomSpeed={1}
										keyboardStep={1}
										onCropChange={setCrop}
										onZoomChange={changeZoom}
										onCropComplete={onCropComplete}
										objectFit="cover"
										showGrid={false}
										zoomWithScroll
										restrictPosition
										roundCropAreaPixels
										mediaProps={{ alt: 'Photo to crop' }}
										cropperProps={{
											tabIndex: 0,
											'aria-label': 'Position cover photo'
										}}
										classes={{
											containerClassName: 'cover-crop-container',
											cropAreaClassName: 'cover-crop-area'
										}}
										style={{
											containerStyle: { background: 'var(--color-ink)' },
											cropAreaStyle: {
												border: 'none',
												boxShadow: 'none'
											}
										}}
									/>
								</Suspense>
							) : (
								<img
									src={pending.previewUrl}
									alt="Photo to crop"
									className="h-full w-full object-cover"
								/>
							)}
							{(reading || processing) && (
								<div className="absolute inset-0 z-10 flex items-center justify-center bg-card/80">
									<p className="text-sm font-extrabold tracking-wider text-mute uppercase">
										{processing ? 'Preparing photo' : 'Reading photo'}
									</p>
								</div>
							)}
							<div className="absolute top-3 right-3 z-10 flex gap-2">
								{coverUrl ? (
									<button
										type="button"
										className="rounded-full border-2 border-line bg-card px-3 py-1 text-xs font-extrabold tracking-wider text-accent uppercase hover:border-accent"
										onClick={cancelPending}
									>
										Cancel
									</button>
								) : null}
								<button
									type="button"
									className="rounded-full border-2 border-line bg-card px-3 py-1 text-xs font-extrabold tracking-wider text-accent uppercase hover:border-accent"
									onClick={() => fileInput.current?.click()}
								>
									Change
								</button>
							</div>
						</div>
						<label className="flex items-center gap-3 px-5 py-3">
							<span className="text-xs font-extrabold tracking-wider text-mute uppercase">
								Zoom
							</span>
							<input
								type="range"
								min={1}
								max={maxZoom}
																disabled={maxZoom === 1}
								step={0.01}
								value={zoom}
								onChange={(event) => changeZoom(Number(event.currentTarget.value))}
								className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-[var(--color-accent)]"
								aria-label="Zoom photo"
								aria-describedby="cover-crop-help"
							/>
						</label>
						<p id="cover-crop-help" className="px-5 pb-3 text-sm text-mute">
							{helper}
						</p>
					</div>
				) : coverUrl ? (
					<div className="relative">
						<CoverImage src={coverUrl} alt="Your cover" className="mx-auto w-full max-w-[16rem]" />
						<button
							type="button"
							className="absolute top-3 right-3 rounded-full border-2 border-line bg-card px-3 py-1 text-xs font-extrabold tracking-wider text-accent uppercase hover:border-accent"
							onClick={() => fileInput.current?.click()}
						>
							Change
						</button>
					</div>
				) : (
					<button
						type="button"
						className="flex h-72 w-full flex-col items-center justify-center gap-3 px-6 text-center"
						onClick={() => fileInput.current?.click()}
					>
						<span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-sun text-accent">
							<svg
								viewBox="0 0 24 24"
								className="h-7 w-7"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3M12 4v11M7.5 8.5 12 4l4.5 4.5" />
							</svg>
						</span>
						<span className="text-xl font-extrabold">{reading ? 'Reading photo' : 'Choose a photo'}</span>
						<span className="text-sm text-mute">{helper}</span>
					</button>
				)}
			</div>
			{error ? (
				<p className="ml-15 text-sm font-medium text-error" role="alert">
					{error}
				</p>
			) : warning ? (
				<p className="ml-15 text-sm font-medium text-mute" role="status" aria-live="polite">
					{warning}
				</p>
			) : null}
		</>
	);
}
