export function registerServiceWorker(): void {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    const serviceWorkerUrl = new URL("/sw.js", window.location.origin);

    navigator.serviceWorker.register(serviceWorkerUrl, { scope: "/" }).catch(() => {
      // The app still works without the worker; localStorage remains the source of truth for progress.
    });
  });
}
