/* Device & browser capability checks. */

export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1); // iPadOS reports as a Mac

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Safari 17.4+ can draw a native iOS-style switch (with haptic feedback). */
export const supportsNativeSwitch = () => 'switch' in HTMLInputElement.prototype;

/** A friendly name for this kind of device: "iPhone", "iPad", "Mac"… */
export function deviceName(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints) {
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'iPad';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'Unknown device';
}
