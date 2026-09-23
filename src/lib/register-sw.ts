/** Single guarded registrar for the offline app-shell service worker.
 * Never registers in dev, in an iframe, or in any Lovable preview host. */
export function registerOfflineWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const { hostname } = window.location;
  const blocked =
    !import.meta.env.PROD ||
    window.self !== window.top ||
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev") ||
    new URL(window.location.href).searchParams.get("sw") === "off";

  if (blocked) {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) {
        if (reg.active?.scriptURL.endsWith("/sw.js")) void reg.unregister();
      }
    });
    return;
  }

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
