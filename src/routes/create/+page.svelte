<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { tick } from 'svelte';
	import { draft, formatGoal, resetDraft, setCover } from '$lib/create/draft.svelte';
	import Tip from '$lib/create/Tip.svelte';

	const STEPS = [
		{ q: 'How much do you want to raise?', sub: 'Pick a starting number. You can change it later.' },
		{ q: 'Add a cover photo', sub: 'A clear photo of the person or place helps more than a logo.' },
		{ q: 'What should we call it?', sub: 'Say who it’s for and the action, like “Help Maya get home”.' },
		{ q: 'Tell people what happened', sub: 'Plain words. Who it’s for, and what the money does.' },
		{ q: 'Does this look right?', sub: 'Tap anything to change it.' }
	] as const;
	const LAST = STEPS.length;

	const SUGGESTED = [50_000, 100_000, 250_000, 500_000];
	const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

	let step = $state(1);
	let done = $state(false);
	let sending = $state(false);
	let shownThrough = $state(0);
	let goalText = $state('');
	let fileInput: HTMLInputElement | undefined = $state();
	let dragging = $state(false);
	let coverError = $state('');

	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	const canContinue = $derived(
		(step === 1 && draft.goal !== null && draft.goal > 0) ||
			(step === 2 && draft.coverUrl !== '') ||
			(step === 3 && draft.title.trim().length > 0) ||
			(step === 4 && draft.story.trim().length > 0) ||
			step === LAST
	);

	const heading = $derived(done ? 'Saved in this browser' : STEPS[step - 1].q);
	const sub = $derived(done ? 'Nothing is public yet. This is your draft.' : STEPS[step - 1].sub);

	function parseGoal(value: string) {
		const digits = value.replace(/[^\d]/g, '');
		if (!digits) {
			draft.goal = null;
			goalText = '';
			return;
		}
		const amount = Number(digits);
		draft.goal = amount > 0 ? amount : null;
		goalText = amount.toLocaleString('en-KE');
	}

	function pickSuggested(amount: number) {
		draft.goal = amount;
		goalText = amount.toLocaleString('en-KE');
	}

	function acceptFile(file: File | undefined) {
		coverError = '';
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			coverError = 'That isn’t an image. Use a JPG, PNG, or WebP.';
			return;
		}
		if (file.size > MAX_IMAGE_BYTES) {
			coverError = 'That photo is over 8 MB. Pick a smaller one.';
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

	async function goTo(n: number) {
		done = false;
		sending = false;
		shownThrough = Math.max(0, n - 1);
		step = n;
		await tick();
		window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
	}

	async function goNext() {
		if (!canContinue) return;
		if (step >= LAST) {
			done = true;
			return;
		}
		sending = true;
		await sleep(160);
		const from = step;
		sending = false;
		step = from + 1;
		await tick();
		window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
		await sleep(220);
		shownThrough = from;
	}

	function goBack() {
		if (done) return void (done = false);
		if (step > 1) void goTo(step - 1);
	}

	function startOver() {
		resetDraft();
		goalText = '';
		coverError = '';
		done = false;
		sending = false;
		shownThrough = 0;
		step = 1;
	}

	function onEnter(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			goNext();
		}
	}

	function onGoalKeydown(e: KeyboardEvent) {
		onEnter(e);
		if (e.key.length === 1 && !/[0-9]/.test(e.key) && !e.metaKey && !e.ctrlKey) {
			e.preventDefault();
		}
	}

	function onGoalInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		parseGoal(input.value);
		input.value = goalText;
	}
</script>

<svelte:head>
	<title>Start a fundraiser · Ghunami</title>
</svelte:head>

{#snippet horizon(cls: string)}
	<svg viewBox="76 114 248 188" class={cls} fill="currentColor" aria-hidden="true">
		<path d="M100 214A100 100 0 0 1 300 214Z" />
		<path d="M76 234H324V258H76Z" />
		<path d="M116 278H284V302H116Z" />
	</svg>
{/snippet}

<!-- A sent bubble: an answer already given. Tap to go back and change it. -->
{#snippet sent(n: number, children: import('svelte').Snippet)}
	<div class="flex justify-end" in:fly={{ y: 16, duration: 280, easing: cubicOut }}>
		<button
			type="button"
			class="group max-w-[85%] rounded-3xl rounded-br-lg bg-accent px-5 py-3 text-left text-base font-medium text-card transition-colors hover:bg-accent-deep"
			onclick={() => goTo(n)}
			aria-label="Change your answer to step {n}"
		>
			<span class="flex items-center gap-3">
				<span class="min-w-0">{@render children()}</span>
				<svg viewBox="0 0 20 20" class="h-4 w-4 shrink-0 text-card/70 transition-colors group-hover:text-card" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M13.5 3.5l3 3L7 16H4v-3z" />
				</svg>
			</span>
		</button>
	</div>
{/snippet}

{#snippet receiptRow(label: string, n: number, children: import('svelte').Snippet)}
	<div class="flex items-start justify-between gap-4 py-4">
		<div class="min-w-0 flex-1">
			<p class="text-sm font-medium text-mute">{label}</p>
			<div class="mt-1">{@render children()}</div>
		</div>
		{#if !done}
			<button
				type="button"
				class="shrink-0 rounded-full border-2 border-line px-3 py-1 text-xs font-extrabold tracking-wider text-accent uppercase hover:border-accent"
				onclick={() => goTo(n)}
			>
				Edit
			</button>
		{/if}
	</div>
{/snippet}

{#snippet photoEdit(n: number)}
	{#if !done}
		<button
			type="button"
			class="absolute top-3 right-3 rounded-full border-2 border-line bg-card px-3 py-1 text-xs font-extrabold tracking-wider text-accent uppercase hover:border-accent"
			onclick={() => goTo(n)}
		>
			Edit
		</button>
	{/if}
{/snippet}

<div class="flex min-h-dvh flex-col">
	<header class="sticky top-0 z-10 bg-paper"><div class="mx-auto flex w-full max-w-[40rem] items-center gap-4 px-4 py-4 md:py-6">
		<a
			href="/"
			aria-label="Cancel and go home"
			class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-mute transition-colors hover:bg-card hover:text-ink"
		>
			<svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
				<path d="M3 3l10 10M13 3L3 13" />
			</svg>
		</a>
		<ol class="flex flex-1 gap-1.5" aria-label="Progress: step {done ? LAST : step} of {LAST}">
			{#each STEPS as s, i (s.q)}
				<li
					class="h-4 flex-1 overflow-hidden rounded-full bg-line transition-colors duration-300"
					aria-current={!done && i + 1 === step ? 'step' : undefined}
				>
					<div
						class="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
						style="width: {done || i + 1 < step ? 100 : i + 1 === step ? 45 : 0}%"
					></div>
				</li>
			{/each}
		</ol>
		</div>
	</header>

	<main class="mx-auto flex w-full max-w-[40rem] flex-1 flex-col justify-end gap-5 px-4 pt-4 pb-32">
		<!-- The thread: answers already sent. -->
		{#if !done && step < LAST}
			{#if shownThrough >= 1 && draft.goal !== null}
				{#snippet goalBubble()}<span class="text-lg font-bold">{formatGoal(draft.goal ?? 0)}</span>{/snippet}
				{@render sent(1, goalBubble)}
			{/if}
			{#if shownThrough >= 2 && draft.coverUrl}
				{#snippet photoBubble()}
					<img src={draft.coverUrl} alt="Your cover" class="h-20 w-28 rounded-2xl object-cover" />
				{/snippet}
				{@render sent(2, photoBubble)}
			{/if}
			{#if shownThrough >= 3 && draft.title.trim()}
				{#snippet titleBubble()}<span class="text-lg font-bold wrap-break-word">{draft.title}</span>{/snippet}
				{@render sent(3, titleBubble)}
			{/if}
		{/if}

		<!-- The question, from ghunami. Arrives after the sent bubble mounts. -->
		{#key `${step}-${done}`}
			<div class="flex flex-col gap-3" in:fly={{ y: 24, duration: 360, delay: 440, easing: cubicOut }}>
				<div class="flex items-end gap-3">
					<span
						class="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-card"
						aria-hidden="true"
					>
						{@render horizon('h-5 w-auto')}
					</span>
					<div class="min-w-0 rounded-3xl rounded-bl-lg bg-card px-6 py-5">
						<h1 class="text-[1.75rem] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance md:text-4xl md:leading-[1.12]">
							{heading}
						</h1>
						<p class="mt-2 text-base text-mute md:text-lg">{sub}</p>
					</div>
				</div>
				{#if !done && step === 2}
					<Tip title="Choosing a photo">
						<p>Use a clear, bright landscape photo. If possible, pick one from a happier time.</p>
					</Tip>
				{:else if !done && step === 3}
					<Tip title="A good title">
						<p>Mention who or what it’s for, and the action.</p>
					</Tip>
				{:else if !done && step === 4}
					<Tip title="What a good story covers">
						<ol class="list-decimal space-y-1 pl-4 marker:font-bold marker:text-accent">
							<li>Introduce yourself.</li>
							<li>Say who or what you’re fundraising for.</li>
							<li>Explain what happened.</li>
							<li>Share how the money will be used.</li>
						</ol>
					</Tip>
				{/if}
			</div>
		{/key}

		<!-- Your reply. Tints accent, then flies up, then the sent bubble mounts. -->
		{#key `${step}-${done}`}
			<div
				class="flex flex-col gap-4 {sending ? 'sending-draft' : ''}"
				in:fly={{ y: 24, duration: 360, delay: 620, easing: cubicOut }}
				out:fly={{ y: -32, duration: 220, easing: cubicOut }}
			>
				{#if done || step === LAST}
					<!-- Receipt -->
					<section class="ml-8 md:ml-14 rounded-3xl rounded-tl-lg bg-card px-6 pt-5 pb-2" aria-label="Your draft">
						{#if done}
							<p class="mb-4 inline-flex items-center gap-2 text-xl font-extrabold text-accent">
								<svg viewBox="0 0 20 20" class="h-6 w-6" fill="currentColor" aria-hidden="true">
									<path d="M10 0a10 10 0 1 0 0 20A10 10 0 0 0 10 0Zm4.7 7.7-5.5 5.5a1 1 0 0 1-1.4 0L5.3 10.7a1 1 0 1 1 1.4-1.4L8.5 11l4.8-4.8a1 1 0 0 1 1.4 1.4Z" />
								</svg>
								Draft confirmed
							</p>
						{/if}
						<div class="divide-y divide-dashed divide-line">
							{#snippet titleVal()}<p class="text-xl font-bold wrap-break-word">{draft.title}</p>{/snippet}
							{@render receiptRow('Title', 3, titleVal)}
							<div class="py-4">
								<p class="text-sm font-medium text-mute">Cover photo</p>
								{#if draft.coverUrl}
									<div class="relative mt-1">
										<img src={draft.coverUrl} alt="Your cover" class="h-56 w-full rounded-2xl object-cover" />
										{@render photoEdit(2)}
									</div>
								{:else}
									<p class="mt-1 text-base">None added</p>
								{/if}
							</div>
							{#snippet goalVal()}<p class="text-3xl font-extrabold tracking-[-0.02em]">{draft.goal !== null ? formatGoal(draft.goal) : '—'}</p>{/snippet}
							{@render receiptRow('Goal', 1, goalVal)}
							{#snippet storyVal()}<p class="whitespace-pre-wrap text-base leading-relaxed">{draft.story}</p>{/snippet}
							{@render receiptRow('Story', 4, storyVal)}
						</div>
					</section>
				{:else if step === 1}
					<label
						class="compose-card ml-15 flex items-baseline gap-3 rounded-3xl rounded-tr-lg border-2 border-line bg-card px-6 py-5 transition-colors duration-150 focus-within:border-accent"
					>
						<span class="sr-only">Goal in Kenyan shillings</span>
						<span class="shrink-0 text-2xl font-extrabold text-accent md:text-3xl" aria-hidden="true">Ksh</span>
						<span class="goal-fit min-w-0 flex-1">
							<input
								class="goal-amount field-bare min-w-0 overflow-hidden whitespace-nowrap font-extrabold tracking-[-0.03em]"
								size="1"
								inputmode="numeric"
								autocomplete="off"
								placeholder="0"
								value={goalText}
								oninput={onGoalInput}
								onkeydown={onGoalKeydown}
							/>
						</span>
					</label>
					<div class="ml-15 flex flex-wrap gap-2" role="group" aria-label="Suggested goals">
						{#each SUGGESTED as amount (amount)}
							<button
								type="button"
								class="rounded-full border-2 px-5 py-2.5 text-base font-bold transition-colors {draft.goal === amount
									? 'border-accent bg-accent text-card'
									: 'border-line bg-card text-accent hover:border-accent'}"
								aria-pressed={draft.goal === amount}
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
					<div
						class="compose-card ml-15 overflow-hidden rounded-3xl rounded-tr-lg border-2 bg-card transition-colors duration-150 {dragging
							? 'border-accent'
							: 'border-line'}"
						role="presentation"
						ondragover={(e) => {
							e.preventDefault();
							dragging = true;
						}}
						ondragleave={() => (dragging = false)}
						ondrop={onDrop}
					>
						{#if draft.coverUrl}
							<div class="relative">
								<img src={draft.coverUrl} alt="Your cover" class="h-72 w-full object-cover" />
								<button
									type="button"
									class="absolute top-3 right-3 rounded-full border-2 border-line bg-card px-3 py-1 text-xs font-extrabold tracking-wider text-accent uppercase hover:border-accent"
									onclick={() => fileInput?.click()}
								>
									Change
								</button>
							</div>
						{:else}
							<button
								type="button"
								class="flex h-72 w-full flex-col items-center justify-center gap-3 px-6 text-center"
								onclick={() => fileInput?.click()}
							>
								<span class="inline-flex h-14 w-14 items-center justify-center rounded-full bg-sun text-accent">
									<svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										<path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3M12 4v11M7.5 8.5 12 4l4.5 4.5" />
									</svg>
								</span>
								<span class="text-xl font-extrabold">Choose a photo</span>
								<span class="text-sm text-mute">or drop one here · JPG, PNG, WebP · up to 8 MB</span>
							</button>
						{/if}
					</div>
					{#if coverError}
						<p class="ml-15 text-sm font-medium text-error" role="alert">{coverError}</p>
					{/if}
				{:else if step === 3}
					<label
						class="compose-card ml-15 block rounded-3xl rounded-tr-lg border-2 border-line bg-card px-6 py-5 transition-colors duration-150 focus-within:border-accent"
					>
						<span class="sr-only">Title</span>
						<textarea
							class="field-bare min-h-[1.2em] resize-none text-2xl font-bold tracking-[-0.01em] wrap-break-word md:text-3xl [field-sizing:content]"
							rows="1"
							maxlength="80"
							placeholder="Help Maya get home"
							bind:value={draft.title}
							onkeydown={onEnter}
						></textarea>
						<span class="mt-2 block text-right text-xs font-medium text-mute">{draft.title.length} / 80</span>
					</label>
				{:else if step === 4}
					<label
						class="compose-card ml-15 block rounded-3xl rounded-tr-lg border-2 border-line bg-card px-6 py-5 transition-colors duration-150 focus-within:border-accent"
					>
						<span class="sr-only">Story</span>
						<textarea
							class="field-bare min-h-56 resize-none text-lg leading-relaxed [field-sizing:content]"
							maxlength="4000"
							placeholder="Hi, I’m Jane. I’m raising money for…"
							bind:value={draft.story}
						></textarea>
						<span class="mt-2 block text-right text-xs font-medium text-mute">{draft.story.length} / 4000</span>
					</label>
				{/if}
			</div>
		{/key}
	</main>

	<footer class="fixed inset-x-0 bottom-0 border-t-2 border-line bg-paper/95 backdrop-blur">
		<div class="mx-auto flex w-full max-w-[40rem] items-center justify-between gap-4 px-4 py-4">
			{#if done}
				<button type="button" class="btn-press border-2 border-line bg-card text-mute [--btn-edge:var(--color-line)] hover:text-ink" onclick={goBack}>
					Back
				</button>
				<a href="/create" class="btn-press bg-accent text-card hover:bg-accent-deep" onclick={startOver}>
					Start another
				</a>
			{:else}
				{#if step === 1}
					<a href="/" class="btn-press border-2 border-line bg-card text-mute [--btn-edge:var(--color-line)] hover:text-ink">
						Cancel
					</a>
				{:else}
					<button type="button" class="btn-press border-2 border-line bg-card text-mute [--btn-edge:var(--color-line)] hover:text-ink" onclick={goBack}>
						Back
					</button>
				{/if}
				<button
					type="button"
					class="btn-press min-w-40 {canContinue ? 'bg-accent text-card hover:bg-accent-deep' : 'bg-line text-mute'}"
					disabled={!canContinue}
					onclick={goNext}
				>
					{step === LAST ? 'Looks good' : 'Continue'}
				</button>
			{/if}
		</div>
	</footer>
</div>

<style>
	.goal-fit {
		container-type: inline-size;
	}
	.goal-amount {
		font-size: min(3.5rem, calc((100cqi - 8px) / 4.2));
		line-height: 1;
	}
	@media (min-width: 768px) {
		.goal-amount {
			font-size: min(4rem, calc((100cqi - 8px) / 4.2));
		}
	}
	.sending-draft :global(.compose-card) {
		background-color: var(--color-accent);
		border-color: var(--color-accent);
		color: var(--color-card);
	}
	.sending-draft :global(.compose-card input),
	.sending-draft :global(.compose-card textarea),
	.sending-draft :global(.compose-card .text-accent) {
		color: var(--color-card);
	}
	.sending-draft :global([role='group'] button) {
		background-color: var(--color-accent);
		border-color: var(--color-accent-deep);
		color: var(--color-card);
	}
</style>
