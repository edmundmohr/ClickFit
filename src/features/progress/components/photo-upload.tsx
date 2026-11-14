"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CameraIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LocalDate } from "@/lib/dates";

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Verkleinert ein Bild im Browser auf höchstens 1600 px Kantenlänge (JPEG).
 * Das spart Speicher und Ladezeit; schlägt es fehl, wird die Originaldatei genommen.
 */
async function downscale(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    return blob ?? file;
  } catch {
    return file;
  }
}

interface PhotoUploadProps {
  today: LocalDate;
  /** Training, dem das Foto zugeordnet wird (optional). */
  sessionId: string | null;
}

export function PhotoUpload({ today, sessionId }: PhotoUploadProps) {
  const t = useTranslations("progress.photos");
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const image = await downscale(file);
      const form = new FormData();
      form.set("file", new File([image], "photo.jpg", { type: image.type || file.type }));
      form.set("date", today);
      form.set("note", note);
      if (sessionId) form.set("sessionId", sessionId);
      const response = await fetch("/api/photos", { method: "POST", body: form });
      if (!response.ok) throw new Error(`Upload failed with ${response.status}`);
      toast.success(t("uploaded"));
      setNote("");
      router.refresh();
    } catch {
      toast.error(t("failed"));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="grid gap-3">
      <Input
        aria-label={t("note")}
        placeholder={t("note")}
        value={note}
        maxLength={200}
        onChange={(event) => setNote(event.target.value)}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button size="lg" disabled={uploading} onClick={() => fileInput.current?.click()}>
        {uploading ? (
          <>
            <Loader2Icon className="animate-spin" aria-hidden />
            {t("uploading")}
          </>
        ) : (
          <>
            <CameraIcon aria-hidden />
            {t("upload")}
          </>
        )}
      </Button>
    </div>
  );
}
