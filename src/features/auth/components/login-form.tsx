"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { authClient } from "@/lib/auth/client";
import type { ErrorCode } from "@/lib/errors";

const HTTP_TOO_MANY_REQUESTS = 429;

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      // Läuft über den HTTP-Endpunkt von Better Auth, damit das Login-Rate-Limit greift.
      const result = await authClient.signIn.username({
        username: String(form.get("username") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      if (result.error) {
        setError(
          result.error.status === HTTP_TOO_MANY_REQUESTS ? "TOO_MANY_REQUESTS" : "INVALID_CREDENTIALS",
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("UNKNOWN");
    } finally {
      setPending(false);
    }
  }

  return (
    // method="post": Sollte das Skript einmal nicht laden, landen die Zugangsdaten nie in der Adresszeile.
    <form method="post" onSubmit={handleSubmit} className="grid gap-4">
      <Field
        id="username"
        name="username"
        label={t("username")}
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
      />
      <Field
        id="password"
        name="password"
        type="password"
        label={t("password")}
        autoComplete="current-password"
        required
      />
      <FormError code={error} />
      <Button type="submit" disabled={pending} size="lg">
        {pending ? (
          <>
            <Loader2Icon className="animate-spin" aria-hidden />
            {t("submitting")}
          </>
        ) : (
          t("submit")
        )}
      </Button>
    </form>
  );
}
