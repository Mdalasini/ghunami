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
		<h1 class="font-display mt-4 text-5xl leading-[1.05] font-extrabold tracking-tight md:text-7xl">
		    You don't have to stand alone.
		</h1>
		<a
			href="/create"
			onclick={start}
			class="btn-press mt-10 bg-accent px-8 text-card hover:bg-accent-deep"
		>
			Start a fundraiser
		</a>
	</main>
</div>
