<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<aside class="rounded-2xl bg-sun px-5 py-4">
	<p
		class="font-ui flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-ink uppercase"
	>
		<svg viewBox="76 114 248 188" class="h-3.5 w-auto" fill="currentColor" aria-hidden="true">
			<path d="M100 214A100 100 0 0 1 300 214Z" />
			<path d="M76 234H324V258H76Z" />
			<path d="M116 278H284V302H116Z" />
		</svg>
		{title}
	</p>
	<div class="mt-2.5 text-sm leading-relaxed text-ink/75">
		{@render children()}
	</div>
</aside>
