import en from "./locales/en.js";

const LOCALES = { en };
const SUPPORTED = Object.keys(LOCALES);
const STORAGE_KEY = "pcb3d-locale";
const FALLBACK = "en";

function detectInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch {}
  const nav = (typeof navigator !== "undefined" && navigator.language) || "";
  const short = nav.split("-")[0];
  return SUPPORTED.includes(short) ? short : FALLBACK;
}

const i18n = $state({ locale: detectInitial() });

export function setLocale(next) {
  if (!SUPPORTED.includes(next)) return;
  i18n.locale = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {}
}

export function getLocale() {
  return i18n.locale;
}

export function availableLocales() {
  return SUPPORTED.slice();
}

function lookup(dict, key) {
  let cur = dict;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in cur) cur = cur[part];
    else return undefined;
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, name) =>
    name in params ? String(params[name]) : `{${name}}`,
  );
}

export function t(key, params) {
  const dict = LOCALES[i18n.locale] || LOCALES[FALLBACK];
  const hit = lookup(dict, key) ?? lookup(LOCALES[FALLBACK], key);
  if (hit === undefined) {
    if (import.meta.env?.DEV) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  return interpolate(hit, params);
}
