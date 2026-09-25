/* Device & browser capability checks. */

export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1); // iPadOS reports as a Mac

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Safari 17.4+ can draw a native iOS-style switch (with haptic feedback). */
export const supportsNativeSwitch = () => 'switch' in HTMLInputElement.prototype;
