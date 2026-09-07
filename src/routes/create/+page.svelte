<script lang="ts">
	import { draft, formatGoal, resetDraft, setCover } from '$lib/create/draft.svelte';

	const STEPS = [
		{ n: 1, label: 'Goal' },
		{ n: 2, label: 'Photo' },
		{ n: 3, label: 'Story' },
		{ n: 4, label: 'Review' }
	] as const;

	const SUGGESTED = [500, 1500, 3500, 10000];
	const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

	let step = $state(1);
	let done = $state(false);
	let goalText = $state('');
	let fileInput: HTMLInputElement | undefined = $state();
	let dragging = $state(false);
	let coverError = $state('');

	const canContinue = $derived(
		(step === 1 && draft.goal !== null && draft.goal > 0) ||
			(step === 2 && draft.coverUrl !== '') ||
			(step === 3 && draft.title.trim().length > 0 && draft.story.trim().length > 0) ||
			step === 4
	);

	const heading = $derived(
		done
			? 'Ready when you are'
			: step === 1
				? 'How much do you want to raise?'
				: step === 2
					? 'Add a cover photo'
					: step === 3
						? 'Give it a title and a story'
						: 'Does this look right?'
	);

	const sub = $derived(
		done
			? 'Nothing is public yet. This is your draft.'
			: step === 1
				? 'Pick a starting number. You can change it later.'
				: step === 2
					? 'A clear photo of the person or place helps more than a logo.'
					: step === 3
						? 'Plain words. Who it’s for, and what the money does.'
						: 'Check the goal, photo, and story before you leave this page.'
	);

	function parseGoal(value: string) {
		const digits = value.replace(/[^\d]/g, '');
		if (!digits) {
			draft.goal = null;
			goalText = '';
			return;
		}
		const amount = Number(digits);
		draft.goal = amount > 0 ? amount : null;
		goalText = amount.toLocaleString('en-US');
	}

	function pickSuggested(amount: number) {
		draft.goal = amount;
		goalText = amount.toLocaleString('en-US');
	}

	function acceptFile(file: File | undefined) {
		coverError = '';
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			coverError = 'Use a JPG, PNG, or WebP image.';
			return;
		}
		if (file.size > MAX_IMAGE_BYTES) {
			coverError = 'Keep the photo under 8 MB.';
			return;
		}
		setCover(file);
	}

	function onFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		acceptFile(input.files?.[0]);
		input.value = '';
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		acceptFile(event.dataTransfer?.files[0]);
	}

	function goNext() {
		if (!canContinue) return;
		if (step < 4) {
			step += 1;
			return;
		}
		done = true;
	}

	function goBack() {
		if (done) {
			done = false;
			return;
		}
		if (step > 1) step -= 1;
	}

	function startOver() {
		resetDraft();
		goalText = '';
		coverError = '';
		done = false;
		step = 1;
	}
</script>

<svelte:head>
	<title>Start a fundraiser · Ghunami</title>
</svelte:head>

<div class="flex min-h-dvh flex-col">
	<header class="flex items-center justify-between px-6 py-5 md:px-10">
		<a href="/" class="font-display text-lg font-bold tracking-tight">ghunami</a>
		{#if !done}
			<p class="font-ui text-sm text-mute">{step} of {STEPS.length}</p>
		{/if}
	</header>

	{#if !done}
		<div class="mx-6 h-1 overflow-hidden rounded-full bg-line/50 md:mx-10" aria-hidden="true">
			<div class="h-full bg-accent" style="width: {(step / STEPS.length) * 100}%"></div>
		</div>
	{/if}

	<div class="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-10 px-6 py-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] md:items-start md:px-10 md:py-16">
		<section class="md:sticky md:top-16">
			<p class="font-ui text-xs font-medium tracking-[0.16em] text-mute uppercase">
				{done ? 'Draft' : STEPS[step - 1].label}
			</p>
			<h1 class="font-display mt-3 text-4xl leading-[1.08] font-extrabold tracking-tight md:text-5xl">
				{heading}
			</h1>
			<p class="mt-4 max-w-md text-lg text-mute">{sub}</p>
		</section>

		<section class="rounded-[28px] bg-card p-6 md:p-10">
			{#if done && draft.goal !== null}
				<article>
					{#if draft.coverUrl}
						<img
							src={draft.coverUrl}
							alt=""
							class="mb-6 h-56 w-full rounded-2xl object-cover"
						/>
					{/if}
					<p class="font-ui text-sm font-medium text-coin">{formatGoal(draft.goal)} goal</p>
					<h2 class="font-display mt-2 text-3xl font-bold tracking-tight">{draft.title}</h2>
					<p class="mt-4 whitespace-pre-wrap text-mute">{draft.story}</p>
				</article>
			{:else if step === 1}
				<label class="font-ui text-sm font-medium text-mute" for="goal">Goal</label>
				<div class="mt-2 flex items-end gap-2 border-b border-line pb-2">
					<span class="font-display text-5xl font-bold text-coin">$</span>
					<input
						id="goal"
						class="font-display w-full bg-transparent text-6xl font-extrabold tracking-tight outline-none"
						inputmode="numeric"
						autocomplete="off"
						placeholder="0"
						value={goalText}
						oninput={(e) => parseGoal(e.currentTarget.value)}
					/>
				</div>
				<p class="font-ui mt-4 text-sm text-mute">
					Fundraisers like yours often start around <button
						type="button"
						class="font-medium text-ink underline decoration-line underline-offset-4"
						onclick={() => pickSuggested(3500)}>$3,500</button>.
				</p>
				<div class="mt-6 flex flex-wrap gap-2">
					{#each SUGGESTED as amount (amount)}
						<button
							type="button"
							class="font-ui rounded-full border px-4 py-2 text-sm {draft.goal === amount
								? 'border-accent bg-accent text-white'
								: 'border-line bg-white'}"
							onclick={() => pickSuggested(amount)}
						>
							{formatGoal(amount)}
						</button>
					{/each}
				</div>
			{:else if step === 2}
				<input
					bind:this={fileInput}
					class="sr-only"
					type="file"
					accept="image/jpeg,image/png,image/webp"
					onchange={onFileChange}
				/>
				{#if draft.coverUrl}
					<div class="overflow-hidden rounded-2xl">
						<img src={draft.coverUrl} alt="" class="h-72 w-full object-cover" />
					</div>
					<p class="font-ui mt-3 text-sm text-mute">{draft.coverName}</p>
					<button
						type="button"
						class="font-ui mt-4 text-sm font-medium underline underline-offset-4"
						onclick={() => fileInput?.click()}
					>
						Change photo
					</button>
				{:else}
					<button
						type="button"
						class="flex h-72 w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center {dragging
							? 'border-accent bg-white'
							: 'border-line'}"
						onclick={() => fileInput?.click()}
						ondragover={(e) => {
							e.preventDefault();
							dragging = true;
						}}
						ondragleave={() => (dragging = false)}
						ondrop={onDrop}
					>
						<span class="font-display text-2xl font-bold">Drop a photo here</span>
						<span class="font-ui mt-2 text-sm text-mute">or click to choose one</span>
					</button>
				{/if}
				{#if coverError}
					<p class="font-ui mt-4 text-sm text-accent-ink" role="alert">{coverError}</p>
				{/if}
			{:else if step === 3}
				<label class="font-ui text-sm font-medium text-mute" for="title">Title</label>
				<input
					id="title"
					class="mt-2 w-full border-b border-line bg-transparent py-2 text-2xl outline-none"
					maxlength="80"
					placeholder="Help Maya get home"
					bind:value={draft.title}
				/>
				<label class="font-ui mt-8 block text-sm font-medium text-mute" for="story">Story</label>
				<textarea
					id="story"
					class="mt-2 min-h-48 w-full resize-y rounded-2xl border border-line bg-white p-4 outline-none"
					maxlength="4000"
					placeholder="Who this is for, what happened, and how the money will be used."
					bind:value={draft.story}
				></textarea>
				<p class="font-ui mt-2 text-right text-xs text-mute">{draft.story.length} / 4000</p>
			{:else}
				{#if draft.coverUrl}
					<img src={draft.coverUrl} alt="" class="h-56 w-full rounded-2xl object-cover" />
					<button
						type="button"
						class="font-ui mt-3 mb-6 text-sm underline underline-offset-4"
						onclick={() => (step = 2)}
					>
						Change cover photo
					</button>
				{/if}
				<div class="flex items-start justify-between gap-4">
					<div>
						<p class="font-ui text-xs font-medium tracking-wide text-mute uppercase">Goal</p>
						<p class="font-display mt-1 text-3xl font-bold">
							{draft.goal !== null ? formatGoal(draft.goal) : '—'}
						</p>
					</div>
					<button
						type="button"
						class="font-ui text-sm underline underline-offset-4"
						onclick={() => (step = 1)}
					>
						Edit
					</button>
				</div>
				<div class="mt-8 flex items-start justify-between gap-4">
					<div class="min-w-0">
						<p class="font-ui text-xs font-medium tracking-wide text-mute uppercase">Title</p>
						<p class="mt-1 text-xl">{draft.title}</p>
					</div>
					<button
						type="button"
						class="font-ui shrink-0 text-sm underline underline-offset-4"
						onclick={() => (step = 3)}
					>
						Edit
					</button>
				</div>
				<div class="mt-8 flex items-start justify-between gap-4">
					<div class="min-w-0">
						<p class="font-ui text-xs font-medium tracking-wide text-mute uppercase">Story</p>
						<p class="mt-1 whitespace-pre-wrap text-mute">{draft.story}</p>
					</div>
					<button
						type="button"
						class="font-ui shrink-0 text-sm underline underline-offset-4"
						onclick={() => (step = 3)}
					>
						Edit
					</button>
				</div>
			{/if}
		</section>
	</div>

	<footer class="sticky bottom-0 flex items-center justify-between border-t border-line/70 bg-paper/90 px-6 py-4 backdrop-blur md:px-10">
		{#if done}
			<button type="button" class="font-ui text-sm font-medium" onclick={() => (done = false)}>
				Back to review
			</button>
			<a
				href="/create"
				class="font-ui rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white"
				onclick={startOver}
			>
				Start another
			</a>
		{:else}
			{#if step === 1}
				<a href="/" class="font-ui text-sm font-medium text-mute">Cancel</a>
			{:else}
				<button type="button" class="font-ui text-sm font-medium" onclick={goBack}>Back</button>
			{/if}
			<button
				type="button"
				class="font-ui rounded-full px-6 py-3 text-sm font-semibold {canContinue
					? 'bg-accent text-white'
					: 'cursor-not-allowed bg-line text-mute'}"
				disabled={!canContinue}
				onclick={goNext}
			>
				{step === 4 ? 'Looks good' : 'Continue'}
			</button>
		{/if}
	</footer>
</div>
