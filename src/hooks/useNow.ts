import { useSyncExternalStore } from "react";

/**
 * The current time, shared by every countdown on the page. Ticks once a
 * minute (on the minute, so "3h 42m" changes when the clock does), and
 * catches up straight away when the tab becomes visible or focused again,
 * since browsers slow timers in background tabs.
 */
let now = Date.now();
const listeners = new Set<() => void>();
let timer = 0;

function tick() {
  now = Date.now();
  listeners.forEach((l) => l());
}

function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    tick();
    schedule();
  }, 60_000 - (Date.now() % 60_000) + 50);
}

function onWake() {
  if (document.visibilityState === "visible") {
    tick();
    schedule();
  }
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    now = Date.now();
    schedule();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now);
}
