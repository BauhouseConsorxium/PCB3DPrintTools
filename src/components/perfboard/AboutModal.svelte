<script>
  import Modal from '../Modal.svelte'
  import { t } from '../../lib/i18n.svelte.js'

  let {
    open = $bindable(false),
  } = $props()

  function dismiss() {
    open = false
    localStorage.setItem("perfboard-intro-seen", "1")
  }
</script>

<Modal
  bind:open
  title=""
  width="w-[560px]"
  maxHeight="max-h-[85vh]"
  panelClass="bg-surface-1 border-2 border-black rounded-2xl shadow-[8px_8px_0_rgba(0,0,0,0.5)]"
>
  <!-- Hero -->
  <div class="relative px-8 pt-10 pb-6 overflow-hidden">
    <!-- Background pattern -->
    <div class="absolute inset-0 opacity-[0.04]" style="background-image: radial-gradient(circle, currentColor 1px, transparent 1px); background-size: 12px 12px; color: var(--accent);"></div>
    <div class="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-accent/15 blur-3xl"></div>
    <div class="absolute -bottom-12 -left-12 w-36 h-36 rounded-full bg-cyan/10 blur-3xl"></div>

    <!-- Close button -->
    <button
      onclick={dismiss}
      class="absolute top-3 right-3 z-10 w-7 h-7 flex items-center justify-center rounded-lg text-purple-light/40 hover:text-white hover:bg-white/10 transition-all"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>

    <div class="relative flex items-start gap-5">
      <!-- Icon -->
      <div class="shrink-0 w-20 h-20 rounded-2xl bg-gradient-to-br from-accent via-accent/90 to-accent/60 border-2 border-black shadow-[4px_4px_0_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.2)] flex items-center justify-center rotate-[-2deg]">
        <svg viewBox="0 0 24 24" class="w-10 h-10 text-[var(--text-on-accent)] drop-shadow-[1px_1px_0_rgba(0,0,0,0.3)]" fill="none" stroke="currentColor" stroke-width="1.2">
          <rect x="2" y="2" width="20" height="20" rx="2" />
          <circle cx="7" cy="7" r="1.5" />
          <circle cx="12" cy="7" r="1.5" />
          <circle cx="17" cy="7" r="1.5" />
          <circle cx="7" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="17" cy="12" r="1.5" />
          <circle cx="7" cy="17" r="1.5" />
          <circle cx="12" cy="17" r="1.5" />
          <circle cx="17" cy="17" r="1.5" />
        </svg>
      </div>

      <!-- Title block -->
      <div class="pt-1">
        <h2 class="text-xl font-black text-cyan-light tracking-tight leading-tight">{t('about.titleLine1')}<br/>{t('about.titleLine2')}</h2>
        <div class="flex items-center gap-2 mt-2">
          <span class="px-2 py-0.5 text-[9px] font-bold rounded-md bg-accent/20 text-accent border border-accent/30">{t('about.version')}</span>
          <span class="text-[10px] text-purple-light/40">{t('about.org')}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Feature strip -->
  <div class="mx-6 py-3 border-y border-black/30 flex items-center justify-between gap-2">
    <div class="flex items-center gap-2">
      <div class="w-6 h-6 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center">
        <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="2" width="12" height="12" rx="1" />
          <circle cx="5" cy="5" r="1" /><circle cx="11" cy="5" r="1" />
          <circle cx="5" cy="11" r="1" /><circle cx="11" cy="11" r="1" />
        </svg>
      </div>
      <span class="text-[10px] text-purple-light/60">{t('about.features.design')}</span>
    </div>
    <svg viewBox="0 0 12 8" class="w-4 h-2 text-purple-light/20" fill="none" stroke="currentColor" stroke-width="1">
      <path d="M0 4h8M8 1l3 3-3 3" />
    </svg>
    <div class="flex items-center gap-2">
      <div class="w-6 h-6 rounded-md bg-cyan/10 border border-cyan/20 flex items-center justify-center">
        <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 text-cyan" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 12V6h8v6" /><path d="M2 12h12" /><path d="M6 6V4h4v2" />
        </svg>
      </div>
      <span class="text-[10px] text-purple-light/60">{t('about.features.print')}</span>
    </div>
    <svg viewBox="0 0 12 8" class="w-4 h-2 text-purple-light/20" fill="none" stroke="currentColor" stroke-width="1">
      <path d="M0 4h8M8 1l3 3-3 3" />
    </svg>
    <div class="flex items-center gap-2">
      <div class="w-6 h-6 rounded-md bg-copper/10 border border-copper/20 flex items-center justify-center">
        <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 text-copper" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 8h10" /><path d="M5 5l-2 3 2 3" /><path d="M11 5l2 3-2 3" />
        </svg>
      </div>
      <span class="text-[10px] text-purple-light/60">{t('about.features.copperTape')}</span>
    </div>
  </div>

  <!-- Narrative -->
  <div class="px-6 py-5 space-y-4 overflow-y-auto max-h-[40vh]">
    <p class="text-[11px] text-purple-light/80 leading-relaxed">
      {t('about.body.p1')}
    </p>
    <p class="text-[11px] text-purple-light/80 leading-relaxed">
      {t('about.body.p2')}
    </p>

    <!-- Pull quote -->
    <div class="relative py-3 px-4 rounded-xl bg-gradient-to-r from-cyan/8 to-transparent border-l-3 border-cyan/40">
      <p class="text-[11px] text-cyan-light/90 leading-relaxed font-medium">
        {t('about.body.pullQuote')}
      </p>
    </div>

    <p class="text-[11px] text-purple-light/80 leading-relaxed">
      {t('about.body.p3')}
    </p>

    <p class="text-[10px] text-purple-light/30 text-right italic">{t('about.body.signature')}</p>
  </div>

  <!-- Footer -->
  <div class="px-6 pb-6 pt-2 flex items-center gap-3">
    <button
      class="flex-1 px-5 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-b from-accent to-accent/80 hover:from-accent-light hover:to-accent text-[var(--text-on-accent)] border-2 border-black shadow-[4px_4px_0_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.2)] transition-all hover:shadow-[5px_5px_0_rgba(0,0,0,0.4)] hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_rgba(0,0,0,0.4)]"
      onclick={dismiss}
    >
      {t('about.cta')}
    </button>
    <a
      href="https://github.com/bauhouse/PCB3DPrintTools"
      target="_blank"
      class="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border-2 border-black bg-surface-2 text-purple-light/50 hover:text-cyan hover:bg-surface-3 shadow-[3px_3px_0_rgba(0,0,0,0.3)] transition-all hover:shadow-[4px_4px_0_rgba(0,0,0,0.3)] hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_rgba(0,0,0,0.3)]"
      title={t('about.github')}
    >
      <svg viewBox="0 0 16 16" class="w-4 h-4" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
    </a>
  </div>
</Modal>
