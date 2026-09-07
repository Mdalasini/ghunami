<script lang="ts">
	import { draft, formatGoal, resetDraft, setCover } from '$lib/create/draft.svelte';
	import Tip from '$lib/create/Tip.svelte';
	import logo from '$lib/assets/logo.svg';

	const STEPS = [
		{ n: 1, label: 'Goal' },
		{ n: 2, label: 'Photo' },
		{ n: 3, label: 'Story' },
		{ n: 4, label: 'Review' }
	] as const;

	const SUGGESTED = [50_000, 100_000, 250_000, 500_000];
	const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

	let step = $state(1);
	let done = $state(false);
	let goalText = $state('');
	let fileInput: HTMLInputElement | undefined = $state();
	let dragging = $state(false);
	let coverError = $state('');

	type EditField = 'goal' | 'photo' | 'title' | 'story';
	let editing = $state<EditField | null>(null);
	let dialogEl: HTMLDialogElement | undefined = $state();
	let editGoalText = $state('');
	let editTitle = $state('');
	let editStory = $state('');
	let editGoalInput: HTMLInputElement | undefined = $state();
	let editTitleInput: HTMLInputElement | undefined = $state();
	let editStoryArea: HTMLTextAreaElement | undefined = $state();
	let editFileInput: HTMLInputElement | undefined = $state();

	const editGoalAmount = $derived(Number(editGoalText.replace(/[^\d]/g, '')) || 0);

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

	const editHeading = $derived(
		editing === 'goal'
			? 'Edit your goal'
			: editing === 'photo'
				? 'Change cover photo'
				: editing === 'title'
					? 'Edit the title'
					: 'Edit the story'
	);

	const canSaveEdit = $derived(
		editing === 'goal'
			? editGoalAmount > 0
			: editing === 'title'
				? editTitle.trim().length > 0
				: editing === 'story'
					? editStory.trim().length > 0
					: false
	);

	$effect(() => {
		if (!editing || !dialogEl) return;
		if (!dialogEl.open) dialogEl.showModal();
		const target =
			editing === 'goal'
				? editGoalInput
				: editing === 'title'
					? editTitleInput
					: editing === 'story'
						? editStoryArea
						: undefined;
		target?.focus();
	});

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
		if (!file) return false;
		if (!file.type.startsWith('image/')) {
			coverError = 'Use a JPG, PNG, or WebP image.';
			return false;
		}
		if (file.size > MAX_IMAGE_BYTES) {
			coverError = 'Keep the photo under 8 MB.';
			return false;
		}
		setCover(file);
		return true;
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

	function onEditFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		if (acceptFile(input.files?.[0])) dialogEl?.close();
		input.value = '';
	}

	function onEditDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		if (acceptFile(event.dataTransfer?.files[0])) dialogEl?.close();
	}

	function openEdit(field: EditField) {
		coverError = '';
		if (field === 'goal') {
			editGoalText = draft.goal !== null ? draft.goal.toLocaleString('en-KE') : '';
		}
		if (field === 'title') editTitle = draft.title;
		if (field === 'story') editStory = draft.story;
		editing = field;
	}

	function parseEditGoal(value: string) {
		const digits = value.replace(/[^\d]/g, '');
		editGoalText = digits ? Number(digits).toLocaleString('en-KE') : '';
	}

	function saveEdit() {
		if (editing === 'goal' && editGoalAmount > 0) {
			draft.goal = editGoalAmount;
			goalText = editGoalText;
		} else if (editing === 'title' && editTitle.trim()) {
			draft.title = editTitle.trim();
		} else if (editing === 'story' && editStory.trim()) {
			draft.story = editStory.trim();
		} else {
			return;
		}
		dialogEl?.close();
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

{#snippet photoTip()}
	<Tip title="Choosing a photo">
		<p>Use a clear, bright landscape photo. If possible, pick one from a happier time.</p>
	</Tip>
{/snippet}

{#snippet titleTip()}
	<Tip title="A good title">
		<p>Mention who or what it’s for, and the action — like “Help Maya get home”.</p>
	</Tip>
{/snippet}

{#snippet storyTips()}
	<Tip title="What a good story covers">
		<ol class="space-y-2">
			{#each ['Introduce yourself.', 'Say who or what you’re fundraising for.', 'Explain what happened.', 'Share how the money will be used.'] as point, i (point)}
				<li class="flex items-start gap-2.5">
					<span
						class="font-ui mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-sun"
						>{i + 1}</span
					>
					<span>{point}</span>
				</li>
			{/each}
		</ol>
	</Tip>
{/snippet}

<div class="flex min-h-dvh flex-col">
	<header class="flex items-center justify-between px-6 py-5 md:px-10">
		<a href="/" aria-label="ghunami — home">
			<img src={logo} alt="ghunami" class="h-7 w-auto" />
		</a>
		{#if !done}
			<p class="font-ui text-sm text-mute">{step} of {STEPS.length}</p>
		{/if}
	</header>

	{#if !done}
		<div class="mx-6 h-1 overflow-hidden rounded-full bg-line/50 md:mx-10" aria-hidden="true">
			<div class="h-full bg-accent" style="width: {(step / STEPS.length) * 100}%"></div>
		</div>
	{/if}

	<div
		class="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-10 px-6 py-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] md:items-start md:px-10 md:py-16"
	>
		<section class="md:sticky md:top-16">
			<p class="font-ui text-xs font-medium tracking-[0.16em] text-mute uppercase">
				{done ? 'Draft' : STEPS[step - 1].label}
			</p>
			<h1
				class="font-display mt-3 text-4xl leading-[1.08] font-extrabold tracking-tight md:text-5xl"
			>
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
				<div class="mt-2 flex items-end gap-3 border-b border-line pb-2">
					<span class="font-display pb-1 text-3xl font-extrabold text-coin">Ksh</span>
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
				<div class="mt-6">{@render photoTip()}</div>
			{:else if step === 3}
				<label class="font-ui text-sm font-medium text-mute" for="title">Title</label>
				<input
					id="title"
					class="mt-2 w-full border-b border-line bg-transparent py-2 text-2xl outline-none"
					maxlength="80"
					placeholder="Help Maya get home"
					bind:value={draft.title}
				/>
				<div class="mt-5">{@render titleTip()}</div>
				<label class="font-ui mt-8 block text-sm font-medium text-mute" for="story">Story</label>
				<textarea
					id="story"
					class="mt-2 min-h-48 w-full resize-y rounded-2xl border border-line bg-white p-4 outline-none"
					maxlength="4000"
					placeholder="Who this is for, what happened, and how the money will be used."
					bind:value={draft.story}
				></textarea>
				<p class="font-ui mt-2 text-right text-xs text-mute">{draft.story.length} / 4000</p>
				<div class="mt-5">{@render storyTips()}</div>
			{:else}
				<div class="flex items-center justify-between gap-4">
					<div class="flex min-w-0 items-center gap-4">
						{#if draft.coverUrl}
							<img
								src={draft.coverUrl}
								alt=""
								class="h-16 w-24 shrink-0 rounded-xl object-cover"
							/>
						{/if}
						<div class="min-w-0">
							<p class="font-ui text-xs font-medium tracking-wide text-mute uppercase">
								Cover photo
							</p>
							<p class="font-ui mt-1 truncate text-sm">{draft.coverName || 'None added'}</p>
						</div>
					</div>
					<button
						type="button"
						class="font-ui shrink-0 text-sm font-medium underline underline-offset-4"
						onclick={() => openEdit('photo')}
					>
						Edit
					</button>
				</div>
				<div class="mt-8 flex items-start justify-between gap-4">
					<div>
						<p class="font-ui text-xs font-medium tracking-wide text-mute uppercase">Goal</p>
						<p class="font-display mt-1 text-3xl font-bold">
							{draft.goal !== null ? formatGoal(draft.goal) : '—'}
						</p>
					</div>
					<button
						type="button"
						class="font-ui text-sm font-medium underline underline-offset-4"
						onclick={() => openEdit('goal')}
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
						class="font-ui shrink-0 text-sm font-medium underline underline-offset-4"
						onclick={() => openEdit('title')}
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
						class="font-ui shrink-0 text-sm font-medium underline underline-offset-4"
						onclick={() => openEdit('story')}
					>
						Edit
					</button>
				</div>
			{/if}
		</section>
	</div>

	<footer
		class="sticky bottom-0 flex items-center justify-between border-t border-line/70 bg-paper/90 px-6 py-4 backdrop-blur md:px-10"
	>
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

{#if editing}
	<dialog
		bind:this={dialogEl}
		class="fixed inset-0 m-auto max-h-[85dvh] w-[min(92vw,34rem)] overflow-y-auto rounded-[28px] bg-card p-6 shadow-[0_24px_60px_-12px_rgb(20_26_34/0.35)] backdrop:bg-ink/45 md:p-8"
		onclose={() => (editing = null)}
		onclick={(e) => {
			if (e.target === e.currentTarget) dialogEl?.close();
		}}
	>
		<div class="flex items-center justify-between gap-4">
			<h2 class="font-display text-2xl font-extrabold tracking-tight">{editHeading}</h2>
			<button
				type="button"
				aria-label="Close"
				class="rounded-full p-2 text-mute transition-colors hover:bg-line/40 hover:text-ink"
				onclick={() => dialogEl?.close()}
			>
				<svg
					viewBox="0 0 16 16"
					class="h-4 w-4"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					aria-hidden="true"
				>
					<path d="M3 3l10 10M13 3L3 13" />
				</svg>
			</button>
		</div>

		<div class="mt-6">
			{#if editing === 'goal'}
				<div class="flex items-end gap-2 border-b border-line pb-2">
					<span class="font-display pb-0.5 text-2xl font-extrabold text-coin">Ksh</span>
					<input
						bind:this={editGoalInput}
						aria-label="Goal amount"
						class="font-display w-full bg-transparent text-4xl font-extrabold tracking-tight outline-none"
						inputmode="numeric"
						autocomplete="off"
						placeholder="0"
						value={editGoalText}
						oninput={(e) => parseEditGoal(e.currentTarget.value)}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								saveEdit();
							}
						}}
					/>
				</div>
				<div class="mt-4 flex flex-wrap gap-2">
					{#each SUGGESTED as amount (amount)}
						<button
							type="button"
							class="font-ui rounded-full border px-3.5 py-1.5 text-sm {editGoalAmount === amount
								? 'border-accent bg-accent text-white'
								: 'border-line bg-white'}"
							onclick={() => (editGoalText = amount.toLocaleString('en-KE'))}
						>
							{formatGoal(amount)}
						</button>
					{/each}
				</div>
			{:else if editing === 'photo'}
				<input
					bind:this={editFileInput}
					class="sr-only"
					type="file"
					accept="image/jpeg,image/png,image/webp"
					onchange={onEditFileChange}
				/>
				{#if draft.coverUrl}
					<div class="overflow-hidden rounded-2xl">
						<img src={draft.coverUrl} alt="" class="h-44 w-full object-cover" />
					</div>
				{/if}
				<button
					type="button"
					class="mt-4 flex h-32 w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center {dragging
						? 'border-accent bg-white'
						: 'border-line'}"
					onclick={() => editFileInput?.click()}
					ondragover={(e) => {
						e.preventDefault();
						dragging = true;
					}}
					ondragleave={() => (dragging = false)}
					ondrop={onEditDrop}
				>
					<span class="font-display text-lg font-bold">
						{draft.coverUrl ? 'Drop a new photo' : 'Drop a photo here'}
					</span>
					<span class="font-ui mt-1 text-sm text-mute">or click to choose one</span>
				</button>
				{#if coverError}
					<p class="font-ui mt-4 text-sm text-accent-ink" role="alert">{coverError}</p>
				{/if}
				<div class="mt-5">{@render photoTip()}</div>
			{:else if editing === 'title'}
				<input
					bind:this={editTitleInput}
					aria-label="Title"
					class="w-full border-b border-line bg-transparent py-2 text-xl outline-none"
					maxlength="80"
					placeholder="Help Maya get home"
					bind:value={editTitle}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							saveEdit();
						}
					}}
				/>
				<div class="mt-4">{@render titleTip()}</div>
			{:else if editing === 'story'}
				<textarea
					bind:this={editStoryArea}
					aria-label="Story"
					class="min-h-40 w-full resize-y rounded-2xl border border-line bg-white p-4 outline-none"
					maxlength="4000"
					placeholder="Who this is for, what happened, and how the money will be used."
					bind:value={editStory}
				></textarea>
				<p class="font-ui mt-2 text-right text-xs text-mute">{editStory.length} / 4000</p>
				<div class="mt-4">{@render storyTips()}</div>
			{/if}
		</div>

		<div class="mt-8 flex items-center justify-end gap-3">
			<button
				type="button"
				class="font-ui rounded-full border border-line bg-white px-5 py-2.5 text-sm font-medium"
				onclick={() => dialogEl?.close()}
			>
				Cancel
			</button>
			{#if editing !== 'photo'}
				<button
					type="button"
					class="font-ui rounded-full px-5 py-2.5 text-sm font-semibold {canSaveEdit
						? 'bg-accent text-white'
						: 'cursor-not-allowed bg-line text-mute'}"
					disabled={!canSaveEdit}
					onclick={saveEdit}
				>
					Save
				</button>
			{/if}
		</div>
	</dialog>
{/if}

<style>
	dialog[open] {
		animation: edit-in 0.24s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes edit-in {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.98);
		}
	}
</style>
