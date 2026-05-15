<script>
  import { availableLocales, getLocale, setLocale, t } from "../lib/i18n.svelte.js";

  let { variant = "dark" } = $props();

  let open = $state(false);
  let rootEl;

  const locales = availableLocales();
  const current = $derived(getLocale());

  function pick(code) {
    setLocale(code);
    open = false;
  }

  function onWindowClick(e) {
    if (!open) return;
    if (!(e.target instanceof Node)) return;
    if (rootEl && !rootEl.contains(e.target)) open = false;
  }
</script>

<svelte:window onclick={onWindowClick} />

<div class="relative" bind:this={rootEl}>
  <button
    type="button"
    onclick={() => (open = !open)}
    title={t('common.language')}
    aria-label={t('common.language')}
    class={variant === 'dark'
      ? 'h-6 flex items-center gap-1 px-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-[#1a1a30] transition-colors'
      : 'h-6 flex items-center gap-1 px-1.5 rounded-lg text-purple-light/60 hover:text-accent hover:bg-surface-2 transition-colors'}
  >
    <svg viewBox="0 0 16 16" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M1.75 8h12.5" />
      <path d="M8 1.75c1.9 2.1 1.9 10.4 0 12.5" />
      <path d="M8 1.75c-1.9 2.1-1.9 10.4 0 12.5" />
    </svg>
    <span class="text-[10px] font-semibold tracking-wider uppercase">{current}</span>
  </button>
  {#if open}
    <div
      class={variant === 'dark'
        ? 'absolute top-full right-0 mt-1.5 min-w-[140px] bg-[#111120] border border-[#2a2a48] rounded-md shadow-xl p-1 z-50'
        : 'absolute top-full right-0 mt-2 min-w-[140px] bg-surface-1 border-2 border-black rounded-lg shadow-[4px_4px_0_black] p-1.5 z-50'}
    >
      {#each locales as code}
        {@const active = code === current}
        <button
          type="button"
          onclick={() => pick(code)}
          class={variant === 'dark'
            ? `w-full flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] rounded transition-colors ${active ? 'bg-[#20203a] text-slate-100' : 'text-slate-400 hover:bg-[#1a1a30] hover:text-slate-100'}`
            : `w-full flex items-center justify-between gap-2 px-2 py-1.5 text-[10px] rounded-lg transition-colors ${active ? 'bg-accent/10 text-cyan-light' : 'text-purple-light/70 hover:bg-surface-2 hover:text-cyan'}`}
        >
          <span class="flex items-center gap-2">
            <span class={variant === 'dark'
              ? 'text-[9px] font-bold tracking-wider uppercase text-slate-500 w-6'
              : 'text-[9px] font-bold tracking-wider uppercase text-purple-light/40 w-6'}>{code}</span>
            <span>{t(`locales.${code}`)}</span>
          </span>
          {#if active}
            <svg viewBox="0 0 12 12" class={variant === 'dark' ? 'w-2.5 h-2.5 text-emerald-400' : 'w-2.5 h-2.5 text-accent'} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 6l3 3 5-5" />
            </svg>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
