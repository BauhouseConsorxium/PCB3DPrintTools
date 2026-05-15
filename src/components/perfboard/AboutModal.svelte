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
  width="w-[600px]"
  maxHeight="max-h-[92vh]"
  panelClass="bg-surface-1 border-2 border-black rounded-2xl shadow-[10px_10px_0_rgba(0,0,0,0.55)] overflow-hidden"
>
  <!-- Title block -->
  <header class="px-9 pt-9 pb-6 relative">
    <button
      onclick={dismiss}
      aria-label="Close"
      class="absolute top-5 right-5 w-7 h-7 flex items-center justify-center rounded-md text-cyan-light/40 hover:text-cyan-light hover:bg-white/5 transition-colors"
    >
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>

    <div class="text-[10px] uppercase tracking-[0.24em] text-accent font-semibold mb-3.5">
      {t('about.kicker')}
    </div>

    <h2 class="text-[26px] font-bold text-white tracking-tight leading-[1.1] max-w-[440px]">
      {t('about.title')}
    </h2>

    <div class="mt-3.5 flex items-center gap-3 text-[11px] text-cyan-light/55">
      <span class="font-mono">{t('about.version')}</span>
      <span class="w-1 h-1 rounded-full bg-cyan-light/25"></span>
      <span>{t('about.license')}</span>
      <span class="w-1 h-1 rounded-full bg-cyan-light/25"></span>
      <span>{t('about.org')}</span>
    </div>
  </header>

  <!-- Hairline -->
  <div class="mx-9 border-t border-white/[0.07]"></div>

  <!-- Body -->
  <article class="px-9 py-7 space-y-4 overflow-y-auto" style="max-height: 38vh;">
    <p class="text-[13px] text-cyan-light/90 leading-[1.7]">
      {t('about.body.p1')}
    </p>
    <p class="text-[13px] text-cyan-light/90 leading-[1.7]">
      {t('about.body.p2')}
    </p>
    <p class="text-[13px] text-cyan-light/90 leading-[1.7]">
      {t('about.body.p3')}
    </p>
    {#if t('about.body.signature')}
      <p class="text-[11px] text-cyan-light/45 pt-2">{t('about.body.signature')}</p>
    {/if}
  </article>

  <!-- Hairline -->
  <div class="mx-9 border-t border-white/[0.07]"></div>

  <!-- Funding -->
  <section class="px-9 py-6">
    <div class="text-[9px] uppercase tracking-[0.24em] text-cyan-light/35 font-semibold mb-3">
      {t('about.funding.label')}
    </div>
    <div class="flex items-center gap-5">
      <img
        src="{import.meta.env.BASE_URL}dana-indonesiana-logo.png"
        alt={t('about.funding.org')}
        class="h-12 w-auto shrink-0"
        style="filter: brightness(0) invert(1); opacity: 0.88;"
      />
      <div class="text-[11px] text-cyan-light/55 leading-relaxed">
        {t('about.funding.description')}
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="px-9 py-6 flex items-center justify-between gap-4 bg-surface-0/40 border-t border-white/[0.07]">
    <a
      href="https://github.com/bauhouse/PCB3DPrintTools"
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center gap-2 text-[11px] font-medium text-cyan-light/55 hover:text-cyan-light transition-colors"
    >
      <svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
      <span>{t('about.github')}</span>
      <svg viewBox="0 0 12 12" class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l6-6M5 3h4v4" />
      </svg>
    </a>

    <button
      onclick={dismiss}
      class="px-6 py-2.5 text-[11px] font-bold tracking-wide uppercase rounded-lg bg-accent hover:bg-accent-light text-[var(--text-on-accent)] border-2 border-black shadow-[3px_3px_0_rgba(0,0,0,0.55)] transition-all hover:shadow-[4px_4px_0_rgba(0,0,0,0.55)] hover:-translate-y-px active:translate-y-0.5 active:shadow-[1px_1px_0_rgba(0,0,0,0.55)]"
    >
      {t('about.cta')}
    </button>
  </footer>
</Modal>
