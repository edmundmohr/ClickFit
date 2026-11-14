"use client";

/**
 * Web Push im Browser: Abo anlegen und entfernen, Pause melden.
 */
import { fromBase64Url } from "@/lib/push/vapid";

/** Merker pro Gerät: Nur wenn hier ein Abo besteht, meldet die App Pausen an den Server. */
const ENABLED_KEY = "clickfit-rest-push";

export const PUSH_STATES = ["unsupported", "needs-install", "inactive", "blocked", "enabled"] as const;
export type PushState = (typeof PUSH_STATES)[number];

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isInstalled(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && navigator.standalone === true);
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export function isRestPushEnabled(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberEnabled(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(ENABLED_KEY, "1");
    else window.localStorage.removeItem(ENABLED_KEY);
  } catch {
    // Ohne Speicher (privates Fenster) bleibt die Benachrichtigung aus.
  }
}

export async function getPushState(): Promise<PushState> {
  const registration = await getRegistration();
  const supported = "PushManager" in window && "Notification" in window;
  // Am iPhone gibt es Web Push nur in der zum Home-Bildschirm hinzugefügten App.
  if (!supported) return isIos() && !isInstalled() ? "needs-install" : "unsupported";
  if (!registration) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const subscription = await registration.pushManager.getSubscription();
  const enabled = subscription !== null && Notification.permission === "granted";
  rememberEnabled(enabled);
  return enabled ? "enabled" : "inactive";
}

async function post(url: string, method: "POST" | "DELETE", body: unknown): Promise<boolean> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => null);
  return response?.ok ?? false;
}

/** Fragt die Erlaubnis ab und meldet das Gerät an. Muss aus einem Tipp heraus aufgerufen werden. */
export async function enablePush(publicKey: string): Promise<PushState> {
  const registration = await getRegistration();
  if (!registration || !("PushManager" in window)) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "inactive";
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: fromBase64Url(publicKey),
  });
  const saved = await post("/api/push/subscription", "POST", subscription.toJSON());
  if (!saved) {
    await subscription.unsubscribe();
    return "inactive";
  }
  rememberEnabled(true);
  return "enabled";
}

export async function disablePush(): Promise<PushState> {
  const registration = await getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await post("/api/push/subscription", "DELETE", { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
  rememberEnabled(false);
  return "inactive";
}

export async function sendTestPush(): Promise<boolean> {
  return post("/api/push/test", "POST", {});
}

/** Meldet dem Server das Ende der laufenden Pause (`null` nimmt die Meldung zurück). */
export function reportRestTimer(endsAt: number | null): void {
  void post("/api/push/rest-timer", "POST", { endsAt: endsAt === null ? null : new Date(endsAt).toISOString() });
}
