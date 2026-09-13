import {
	type ChangeEvent,
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

/* Match the `.cover-tray` close transitions in index.css: lowering out of view, or shrinking away when sent. */
const TRAY_CLOSE_MS = 320;
const TRAY_SENT_MS = 200;

type Closing = 'lower' | 'sent' | null;

type Size = { width: number; height: number };

export type CoverPhotoFieldHandle = {
	confirm: () => Promise<boolean>;
	openPicker: () => void;
	addFile: (file: File | undefined) => void;
	/* Drop the pending photo and any saved cover, returning to the empty state. */
	clear: () => void;
};

/*
 * The photo tray. It stays mounted for the whole flow and rises from behind the composer while the
 * cover step is active, so the thread behind it never moves. Leaving the step (send, cancel, back)
 * lowers it again; the photo is only released once that transition has finished.
 */
export function CoverPhotoField({
	active,
	coverUrl,
	ref,
	onReadyChange,
	onCroppingChange
}: {
	active: boolean;
	coverUrl: string;
	ref?: Ref<CoverPhotoFieldHandle>;
	onReadyChange: (ready: boolean) => void;
	onCroppingChange?: (cropping: boolean) => void;
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
	/* Closing keeps the photo mounted while the tray leaves, then runs the queued cleanup. */
	const [closing, setClosing] = useState<Closing>(null);
	const closeTimer = useRef(0);
	const onClosedRef = useRef<(() => void) | null>(null);
	/* Set by a successful confirm, so deactivating right after reads as "sent" rather than "left". */
	const sentRef = useRef(false);

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
		onCroppingChange?.(Boolean(pending));
		return () => {
			onCroppingChange?.(false);
		};
	}, [pending, onCroppingChange]);

	useEffect(() => {
		return () => {
			loadIdRef.current += 1;
			window.clearTimeout(closeTimer.current);
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
		if (closing || !active) {
			publishReady(false);
			return;
		}
		if (pending) {
			publishReady(cropQuality !== null && cropQuality !== 'too_small' && !reading && !processing);
			return;
		}
		publishReady(coverUrl !== '' && !reading && !processing);
	}, [active, pending, cropQuality, coverUrl, reading, processing, closing, publishReady]);

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

	/* Close the tray, then run `then` once it is out of view. Queued cleanups all run. */
	function closeThen(then: () => void, how: Exclude<Closing, null> = 'lower') {
		const previous = onClosedRef.current;
		onClosedRef.current = previous
			? () => {
					previous();
					then();
				}
			: then;
		setClosing(how);
		window.clearTimeout(closeTimer.current);
		closeTimer.current = window.setTimeout(
			() => {
				const queued = onClosedRef.current;
				onClosedRef.current = null;
				queued?.();
				setClosing(null);
			},
			how === 'sent' ? TRAY_SENT_MS : TRAY_CLOSE_MS
		);
	}

	/* A new photo interrupts a closing tray: finish the queued cleanup now so it cannot swallow the new photo. */
	function settleClose() {
		window.clearTimeout(closeTimer.current);
		const queued = onClosedRef.current;
		onClosedRef.current = null;
		queued?.();
		setClosing(null);
	}

	async function acceptFile(file: File | undefined, savedCrop?: Area) {
		if (!file) return;

		settleClose();
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

	/* Editing the cover later re-opens the original with its saved crop. */
	useEffect(() => {
		if (!active) return;
		const saved = getDraft().coverEdit;
		if (saved) void acceptFile(saved.original, saved.crop);
	}, [active]);

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

	/*
	 * Encode the crop into the draft. The photo stays on screen: the caller moves the thread on,
	 * which deactivates the field and lowers the tray over the new message.
	 */
	async function confirm() {
		if (processing || reading || closing) return false;
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
			setCover(file, originalRef.current ? {
				original: originalRef.current,
				crop: cropPercent
			} : undefined);
			setError('');
			sentRef.current = true;
			return true;
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : COVER_MESSAGES.encodeFailed);
			return false;
		} finally {
			setProcessing(false);
		}
	}

	/* Forget the pending photo without touching the saved cover. */
	function dropPending() {
		loadIdRef.current += 1;
		replacePending(null);
		resetCrop();
		originalRef.current = null;
		setInitialCrop(undefined);
		setFileName('');
		setError('');
		setWarning('');
		setReading(false);
	}

	function clearNow() {
		dropPending();
		if (getDraft().coverUrl) clearCover();
	}

	function clear() {
		if (closing) return;
		if (!pending && coverUrl === '' && !reading) {
			clearNow();
			return;
		}
		closeThen(clearNow);
	}

	/*
	 * Leaving the step closes the tray and then releases the photo; it was either sent or discarded.
	 * From here the caller owns the draft's cover (Cancel restored it, Send or Skip replaced it), so a
	 * removal still queued from this step must not run against it.
	 */
	useEffect(() => {
		if (active) {
			sentRef.current = false;
			return;
		}
		const sent = sentRef.current;
		sentRef.current = false;
		onClosedRef.current = null;
		if (!decodedRef.current && !reading) return;
		closeThen(dropPending, sent ? 'sent' : 'lower');
	}, [active]);

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
	const open = active && (hasAttachment || reading) && closing === null;
	const helper = canZoom ? 'Drag to reposition · zoom is limited to preserve photo quality' : 'Drag to reposition';
	const message = error || warning;

	return (
		<>
			<input
				ref={fileInput}
				className="sr-only"
				type="file"
				accept={COVER_ACCEPT}
				onChange={onFileChange}
			/>
			<div className="cover-tray-dock" aria-hidden={!open}>
				<div
					className={`cover-tray mx-auto w-full max-w-[40rem] px-4 ${
						open ? 'is-raised' : closing === 'sent' ? 'is-sent' : ''
					}`}
				>
					<div
						className="attachment-tray relative overflow-hidden rounded-3xl border-2 border-line bg-card shadow-[0_-8px_32px_-12px_rgba(15,26,18,0.25)]"
						style={showViewport ? {
							width: 'min(100%, 24rem, max(11rem, calc(62dvh - 220px)))',
							marginInline: 'auto'
						} : undefined}
						role="presentation"
					>
						{hasAttachment && !processing && (
							<button
								type="button"
								className="absolute top-3 right-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-card/95 text-ink shadow-md transition-colors hover:bg-card hover:text-error"
								onClick={clear}
								aria-label="Remove photo"
								tabIndex={open ? 0 : -1}
							>
								<svg
									viewBox="0 0 16 16"
									className="h-4 w-4"
									fill="none"
									stroke="currentColor"
									strokeWidth="2.4"
									strokeLinecap="round"
									aria-hidden="true"
								>
									<path d="M3 3l10 10M13 3L3 13" />
								</svg>
							</button>
						)}
						{showViewport ? (
							<div className="relative">
								<div
									ref={cropViewport}
									className="relative w-full overflow-hidden bg-ink"
									style={{ aspectRatio: COVER_ASPECT }}
								>
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
												cropperProps={{
													tabIndex: open ? 0 : -1,
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
								</div>
								{/* Fixed height whether or not the slider is shown, so the card never jumps. */}
								<div className="flex min-h-[5.25rem] flex-col justify-center gap-2 px-5 py-3">
									{pending && canZoom && (
										<label className="flex items-center gap-3">
											<span className="text-xs font-extrabold tracking-wider text-mute uppercase">
												Zoom
											</span>
											<input
												type="range"
												min={0}
												max={100}
												step={0.5}
												value={zoomToPercent(zoom, maxZoom)}
												onChange={(event) =>
													changeZoom(percentToZoom(Number(event.currentTarget.value), maxZoom))
												}
												className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-[var(--color-accent)]"
												aria-label="Zoom photo"
												aria-valuetext={`${zoom.toFixed(2)}×`}
												aria-describedby="cover-crop-help"
												tabIndex={open ? 0 : -1}
											/>
										</label>
									)}
									{pending && error ? (
										<p className="text-sm font-medium text-error" role="alert">
											{error}
										</p>
									) : pending && warning ? (
										<p className="text-sm font-medium text-mute" role="status" aria-live="polite">
											{warning}
										</p>
									) : (
										<p id="cover-crop-help" className="text-sm text-mute">
											{pending ? helper : 'Reading photo'}
										</p>
									)}
								</div>
							</div>
						) : coverUrl ? (
							<div className="relative">
								<CoverImage src={coverUrl} alt="Your cover" className="mx-auto w-full max-w-[16rem]" />
							</div>
						) : null}
					</div>
				</div>
			</div>
			{active && !showViewport && message ? (
				error ? (
					<p className="px-2 text-sm font-medium text-error" role="alert">
						{error}
					</p>
				) : (
					<p className="px-2 text-sm font-medium text-mute" role="status" aria-live="polite">
						{warning}
					</p>
				)
			) : null}
		</>
	);
}
