<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<!-- Second incoming from ghunami: Horizon avatar + incoming tail. -->
<div class="flex items-end gap-3">
	<span
		class="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-card"
		aria-hidden="true"
	>
		<svg viewBox="76 114 248 188" class="h-5 w-auto" fill="currentColor">
			<path d="M100 214A100 100 0 0 1 300 214Z" />
			<path d="M76 234H324V258H76Z" />
			<path d="M116 278H284V302H116Z" />
		</svg>
	</span>
	<aside class="min-w-0 rounded-3xl rounded-bl-lg bg-card px-5 py-4 text-mute">
		<p class="text-sm font-bold text-ink">{title}</p>
		<div class="mt-1.5 text-sm leading-relaxed">
			{@render children()}
		</div>
	</aside>
</div>
