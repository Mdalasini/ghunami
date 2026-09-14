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
import type { Area, MediaSize, Point } from 'react-easy-crop';
import {
	COVER_ACCEPT,
	COVER_ASPECT,
	COVER_MESSAGES,
	assessCropResolution,
	coverZoomLimit,
	decodeCoverImage,
	percentCropToPixels,
	maxCoverZoom,
	percentToZoom,
	processCoverCrop,
	releaseDecodedCover,
	validateCoverFile,
	zoomOneCrop,
	zoomToPercent,
	type CropQuality,
	type DecodedCover
} from '../lib/coverImage';
import { clearCover, getDraft, setCover } from '../lib/draft';
import { CoverImage } from './CoverImage';

const Cropper = lazy(() => import('react-easy-crop'));

type Size = { width: number; height: number };

export type CoverPhotoFieldHandle = {
	confirm: () => Promise<boolean>;
	openPicker: () => void;
	addFile: (file: File | undefined) => void;
	/* Drop the pending photo and any saved cover, returning to the empty state. */
	clear: () => void;
};

/*
 * The cover step's field. Empty, it is a drop zone; once a photo is chosen it becomes the crop card.
 * Mount it for the cover step only: a saved cover re-opens with its crop, and leaving the step
 * releases the decoded photo.
 */
export function CoverPhotoField({
	coverUrl,
	ref,
	onReadyChange,
	onBusyChange
}: {
	coverUrl: string;
	ref?: Ref<CoverPhotoFieldHandle>;
	onReadyChange: (ready: boolean) => void;
	onBusyChange?: (busy: boolean) => void;
}) {
	const fileInput = useRef<HTMLInputElement>(null);
	const cropViewport = useRef<HTMLDivElement>(null);
	const [cropSize, setCropSize] = useState<Size>();
	const [mediaSize, setMediaSize] = useState<MediaSize>();
	const decodedRef = useRef<DecodedCover | null>(null);
	const originalRef = useRef<File | null>(null);
	const [initialCrop, setInitialCrop] = useState<Area>();
	const cropPercentRef = useRef<Area | null>(null);
	const confirmRef = useRef<() => Promise<boolean>>(async () => false);
	const loadIdRef = useRef(0);
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
	const [dragging, setDragging] = useState(false);

	/*
	 * Until the cropper has measured itself, estimate from the original's size. Once it reports the
	 * media and crop sizes it uses, derive the limit from those so the top of the slider is exactly
	 * the last sharp position.
	 */
	const maxZoom = (() => {
		if (!pending) return 1;
		if (!cropSize || !mediaSize || mediaSize.width <= 0 || mediaSize.height <= 0) {
			return maxCoverZoom(pending.width, pending.height);
		}
		const base = zoomOneCrop(cropSize, mediaSize, pending);
		return coverZoomLimit(base.width, base.height);
	})();
	const canZoom = maxZoom > 1;
	const clampZoom = useCallback(
		(value: number) => Math.max(1, Math.min(maxZoom, value)),
		[maxZoom]
	);
	const changeZoom = (value: number) => setZoom(clampZoom(value));

	useEffect(() => {
		if (zoom > maxZoom) setZoom(maxZoom);
	}, [zoom, maxZoom]);

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
	}, [pending, reading]);

	useEffect(() => {
		setClient(true);
	}, []);

	useEffect(() => {
		return () => {
			loadIdRef.current += 1;
			releaseDecodedCover(decodedRef.current);
			decodedRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (pending) {
			onReadyChange(cropQuality !== null && cropQuality !== 'too_small' && !reading && !processing);
			return;
		}
		onReadyChange(coverUrl !== '' && !reading && !processing);
	}, [pending, cropQuality, coverUrl, reading, processing, onReadyChange]);

	useEffect(() => {
		onBusyChange?.(reading || processing);
	}, [reading, processing, onBusyChange]);

	function replacePending(next: DecodedCover | null) {
		releaseDecodedCover(decodedRef.current);
		decodedRef.current = next;
		setMediaSize(undefined);
		setPending(next);
	}

	function resetCrop() {
		setCrop({ x: 0, y: 0 });
		setZoom(1);
		cropPercentRef.current = null;
		setCropQuality(null);
	}

	async function acceptFile(file: File | undefined, savedCrop?: Area) {
		/* A photo arriving mid-encode would otherwise be saved as the original of the crop being confirmed. */
		if (!file || processing) return;

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
			originalRef.current = file;
			setInitialCrop(savedCrop);
			setFileName(file.name);
			setWarning('');
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

	/* Coming back to the step re-opens the original with its saved crop. */
	useEffect(() => {
		const saved = getDraft().coverEdit;
		if (saved) void acceptFile(saved.original, saved.crop);
	}, []);

	function onFileChange(event: ChangeEvent<HTMLInputElement>) {
		void acceptFile(event.currentTarget.files?.[0]);
		event.currentTarget.value = '';
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

	/* Encode the crop into the draft. Without a pending photo, a saved cover counts as confirmed. */
	async function confirm() {
		if (processing || reading) return false;
		const decoded = decodedRef.current;
		const cropPercent = cropPercentRef.current;
		if (!decoded || !cropPercent) {
			return coverUrl !== '';
		}

		const original = originalRef.current;
		setProcessing(true);
		try {
			const file = await processCoverCrop(decoded.bitmap, cropPercent, fileName);
			setCover(file, original ? { original, crop: cropPercent } : undefined);
			setError('');
			return true;
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : COVER_MESSAGES.encodeFailed);
			return false;
		} finally {
			setProcessing(false);
		}
	}

	function clear() {
		loadIdRef.current += 1;
		replacePending(null);
		resetCrop();
		originalRef.current = null;
		setInitialCrop(undefined);
		setFileName('');
		setError('');
		setWarning('');
		setReading(false);
		if (getDraft().coverUrl) clearCover();
	}

	function onDrop(event: DragEvent<HTMLElement>) {
		event.preventDefault();
		setDragging(false);
		void acceptFile(event.dataTransfer.files[0]);
	}

	function onDragOver(event: DragEvent<HTMLElement>) {
		event.preventDefault();
		setDragging(true);
	}

	confirmRef.current = confirm;
	useImperativeHandle(ref, () => ({
		confirm: () => confirmRef.current(),
		openPicker: () => fileInput.current?.click(),
		addFile: (file) => void acceptFile(file),
		clear
	}));

	const showCropper = Boolean(pending);
	const showViewport = showCropper || reading;
	const hasAttachment = showCropper || coverUrl !== '';
	const helper = canZoom ? 'Drag to reposition · zoom is limited to preserve photo quality' : 'Drag to reposition';
	const message = error || warning;

	return (
		<div className="flex flex-col gap-3">
			<input
				ref={fileInput}
				className="sr-only"
				type="file"
				accept={COVER_ACCEPT}
				onChange={onFileChange}
			/>
			{!hasAttachment && !reading ? (
				<button
					type="button"
					className={`flex min-h-52 w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 ${
						dragging ? 'border-accent bg-sun' : 'border-line bg-card hover:border-accent hover:bg-sun/40'
					}`}
					onClick={() => fileInput.current?.click()}
					onDragOver={onDragOver}
					onDragLeave={() => setDragging(false)}
					onDrop={onDrop}
					aria-label="Choose a photo"
					aria-describedby="cover-limits"
				>
					<svg
						viewBox="0 0 48 48"
						className="h-14 w-14 text-mute"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<path d="M14 36a8 8 0 0 1-1-15.9A11 11 0 0 1 34 17a9 9 0 0 1 2 18h-2" />
						<path d="M24 40V24M17 31l7-7 7 7" />
					</svg>
					<span className="text-base font-bold">
						Choose file <span className="font-medium text-mute">or drag here</span>
					</span>
					<span id="cover-limits" className="text-sm text-mute">
						JPG, PNG, HEIC, WebP · up to 25 MB
					</span>
				</button>
			) : (
				<div
					className="relative isolate w-full overflow-hidden rounded-3xl bg-ink"
					// Shrink on short screens so OK stays nearby, but never below a usable crop (20rem).
					style={{ maxWidth: `min(100%, max(20rem, calc((100svh - 28rem) * ${COVER_ASPECT})))` }}
					onDragOver={onDragOver}
					onDragLeave={() => setDragging(false)}
					onDrop={onDrop}
				>
					{/* Keep the visible photo at the output ratio so the preview matches the saved crop. */}
					<div
						ref={cropViewport}
						className="relative w-full overflow-hidden bg-ink"
						style={{ aspectRatio: COVER_ASPECT }}
					>
						{showViewport ? (
							<>
								{pending && client && cropSize ? (
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
											key={pending.previewUrl}
											image={pending.previewUrl}
											initialCroppedAreaPercentages={initialCrop}
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
											setMediaSize={setMediaSize}
											objectFit="cover"
											showGrid={false}
											zoomWithScroll={canZoom}
											restrictPosition
											roundCropAreaPixels
											mediaProps={{ alt: 'Photo to crop' }}
											cropperProps={{ 'aria-label': 'Position cover photo' }}
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
								) : pending ? (
									<img
										src={pending.previewUrl}
										alt="Photo to crop"
										className="h-full w-full object-cover"
									/>
								) : null}
								{(reading || processing) && (
									<div className="absolute inset-0 z-10 flex items-center justify-center bg-card/80">
										<p className="text-sm font-extrabold tracking-wider text-mute uppercase">
											{processing ? 'Preparing photo' : 'Reading photo'}
										</p>
									</div>
								)}
							</>
						) : (
							<CoverImage src={coverUrl} alt="Your cover" className="h-full w-full" />
						)}
					</div>
					{!reading && !processing && (
						<>
							<div className="absolute top-3 right-3 z-20 flex items-center gap-2">
								<button
									type="button"
									className="min-h-11 rounded-full bg-black/60 px-4 text-xs font-bold text-white backdrop-blur-md transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
									onClick={() => fileInput.current?.click()}
								>
									Change photo
								</button>
								<button
									type="button"
									className="flex size-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
									onClick={clear}
									aria-label="Remove photo"
									title="Remove photo"
								>
									<svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
										<path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
									</svg>
								</button>
							</div>
							{pending && (
								<div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-4 pt-10 pb-4 text-white">
									{canZoom && (
										<label className="pointer-events-auto flex min-h-11 items-center gap-3">
											<span className="text-xs font-bold">Zoom</span>
											<input
												type="range"
												min={0}
												max={100}
												step={0.5}
												value={zoomToPercent(zoom, maxZoom)}
												onChange={(event) => changeZoom(percentToZoom(Number(event.currentTarget.value), maxZoom))}
												className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/40 accent-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
												aria-label="Zoom photo"
												aria-valuetext={`${zoom.toFixed(2)}×`}
												aria-describedby="cover-crop-help"
											/>
										</label>
									)}
									<p id="cover-crop-help" className="text-center text-xs leading-relaxed text-white/90">
										{helper}
									</p>
								</div>
							)}
						</>
					)}
				</div>
			)}
			{message ? (
				error ? (
					<p className="text-sm font-medium text-error" role="alert">
						{error}
					</p>
				) : (
					<p className="text-sm font-medium text-mute" role="status" aria-live="polite">
						{warning}
					</p>
				)
			) : null}
		</div>
	);
}
