"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CloudOffIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getSyncEngine, tellServiceWorker } from "@/lib/offline/client";
import type { SyncState } from "@/lib/offline/engine";

const SERVER_STATE: SyncState = { pending: 0, syncing: false, failed: false, rejected: 0 };
/** Solange etwas wartet, wird in diesem Abstand erneut versucht. */
const RETRY_MS = 20_000;
/**
 * Seiten, die auch nach einem Start ohne Netz da sein sollen. Der Service Worker merkt sich
 * sonst nur Seiten, die direkt geladen wurden – nicht solche, die man in der App antippt.
 */
const KEEP_OFFLINE = ["/", "/training"];
const KEEP_OFFLINE_EVERY_MS = 5 * 60_000;
const lastKept = new Map<string, number>();

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/** Ob der Browser eine Verbindung meldet. Beim Rendern auf dem Server gilt: online. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Stand der Offline-Warteschlange. */
export function useSyncState(): SyncState {
  const engine = getSyncEngine();
  return useSyncExternalStore(engine.subscribe, engine.getState, () => SERVER_STATE);
}

interface OfflineSyncProps {
  userId: string;
  /** Hinweis-Leiste anzeigen. Der Trainingsmodus hat einen eigenen Hinweis. */
  banner?: boolean;
}

/**
 * Hält die Offline-Warteschlange am Laufen: überträgt beim Start, sobald die Verbindung
 * zurück ist und wenn die App wieder in den Vordergrund kommt.
 */
export function OfflineSync({ userId, banner = true }: OfflineSyncProps) {
  const t = useTranslations("sync");
  const online = useOnline();
  const state = useSyncState();
  const reportedRejected = useRef(0);
  const pathname = usePathname();

  useEffect(() => {
    if (!KEEP_OFFLINE.includes(pathname) || !navigator.onLine) return;
    const now = Date.now();
    if (now - (lastKept.get(pathname) ?? 0) < KEEP_OFFLINE_EVERY_MS) return;
    lastKept.set(pathname, now);
    tellServiceWorker({ type: "cache-page", url: pathname });
  }, [pathname]);

  useEffect(() => {
    const engine = getSyncEngine();
    const sync = () => void engine.syncNow();
    void engine.setUser(userId).then(sync);
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      if (engine.getState().pending > 0 && navigator.onLine) sync();
    }, RETRY_MS);
    return () => {
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [userId]);

  // Sind wartende Änderungen angekommen, zeigt die Seite sonst noch den Stand von davor.
  const router = useRouter();
  const hadPending = useRef(false);
  useEffect(() => {
    if (state.pending > 0) hadPending.current = true;
    else if (hadPending.current) {
      hadPending.current = false;
      // Der Trainingsmodus (ohne Leiste) hält seinen Stand selbst aktuell.
      if (banner) router.refresh();
    }
  }, [state.pending, router, banner]);

  useEffect(() => {
    if (state.rejected <= reportedRejected.current) return;
    toast.warning(t("rejected", { count: state.rejected - reportedRejected.current }));
    reportedRejected.current = state.rejected;
  }, [state.rejected, t]);

  const waiting = state.pending > 0 && state.failed;
  if (!banner || (online && !waiting)) return null;
  return (
    <div role="status" className="bg-secondary mb-4 flex items-start gap-3 rounded-xl px-4 py-3 text-sm">
      <CloudOffIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="grid flex-1 gap-1">
        {online ? null : <p className="font-medium">{t("offlineTitle")}</p>}
        {online ? null : <p className="text-muted-foreground">{t("offlineText")}</p>}
        {state.pending > 0 ? <p>{t("pending", { count: state.pending })}</p> : null}
        {waiting && online ? (
          <Button
            size="sm"
            variant="outline"
            className="justify-self-start"
            disabled={state.syncing}
            onClick={() => void getSyncEngine().syncNow()}
          >
            {t("retry")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
