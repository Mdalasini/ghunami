<script lang="ts">
	import { goto } from '$app/navigation';
	import { resetDraft } from '$lib/create/draft.svelte';
	import logo from '$lib/assets/logo.svg';

	function start(event: MouseEvent) {
		event.preventDefault();
		resetDraft();
		void goto('/create');
	}
</script>

<svelte:head>
	<title>Ghunami</title>
</svelte:head>

<div class="min-h-dvh px-6 py-8 md:px-12">
	<header class="flex items-center justify-between">
		<a href="/" aria-label="ghunami — home">
			<img src={logo} alt="ghunami" class="h-8 w-auto" />
		</a>
		<a
			href="/create"
			onclick={start}
			class="font-ui rounded-full border border-ink/15 px-4 py-2 text-sm font-medium hover:bg-sun"
		>
			Start a fundraiser
		</a>
	</header>

	<main class="mx-auto flex max-w-3xl flex-col items-center pt-28 text-center md:pt-36">
		<p class="font-ui text-xs font-medium tracking-[0.18em] text-mute uppercase">Fundraising</p>
		<h1 class="font-display mt-4 text-5xl leading-[1.05] font-extrabold tracking-tight md:text-7xl">
			Start with the number. The story comes next.
		</h1>
		<p class="mt-6 max-w-lg text-lg text-mute">
			Set a goal, add a photo, write it plainly. You can review everything before anyone else sees
			it.
		</p>
		<a
			href="/create"
			onclick={start}
			class="font-ui mt-10 rounded-full bg-accent px-8 py-3.5 text-sm font-semibold text-ink hover:bg-accent-deep hover:text-card"
		>
			Start a fundraiser
		</a>
	</main>
</div>
