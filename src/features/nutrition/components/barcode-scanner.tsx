"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const BARCODE_PATTERN = /^\d{6,14}$/;

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
}

/**
 * Barcode-Scan per Kamera. Die Erkennung (ZXing) wird erst beim Öffnen nachgeladen.
 * Ohne Kamera oder ohne Freigabe bleibt die Eingabe von Hand.
 */
export function BarcodeScanner({ open, onClose, onDetected }: BarcodeScannerProps) {
  const t = useTranslations("nutrition.scanner");
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [manual, setManual] = useState("");

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let stop: (() => void) | null = null;

    const start = async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const video = videoRef.current;
        if (cancelled || !video) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          video,
          (result) => {
            const text = result?.getText();
            if (text && BARCODE_PATTERN.test(text)) onDetectedRef.current(text);
          },
        );
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
      } catch {
        if (!cancelled) setCameraFailed(true);
      }
    };
    void start();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [open]);

  function handleOpenChange(next: boolean) {
    if (next) return;
    setCameraFailed(false);
    setManual("");
    onClose();
  }

  const manualValid = BARCODE_PATTERN.test(manual.trim());

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{cameraFailed ? t("noCamera") : t("hint")}</DialogDescription>
        </DialogHeader>
        {cameraFailed ? null : (
          <video ref={videoRef} muted playsInline className="aspect-video w-full rounded-lg bg-black object-cover" />
        )}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (manualValid) onDetected(manual.trim());
          }}
        >
          <Input
            inputMode="numeric"
            aria-label={t("manual")}
            placeholder={t("manualPlaceholder")}
            value={manual}
            onChange={(event) => setManual(event.target.value)}
          />
          <Button type="submit" disabled={!manualValid}>
            {t("lookup")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
