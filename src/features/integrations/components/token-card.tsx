"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { KeyRoundIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActionRunner } from "@/hooks/use-action-runner";
import { createTokenAction, deleteTokenAction } from "../actions";
import { MAX_TOKENS_PER_USER, TOKEN_NAME_MAX_LENGTH } from "../constants";
import type { ApiTokenView } from "../services/token-service";
import { CopyButton } from "./copy-button";

/** API-Token anlegen, einmalig anzeigen und wieder löschen. */
export function TokenCard({ tokens }: { tokens: ApiTokenView[] }) {
  const t = useTranslations();
  const format = useFormatter();
  const { run, pending } = useActionRunner();
  const [name, setName] = useState("");
  /** Der gerade angelegte Token im Klartext; verschwindet beim Schließen oder Neuladen. */
  const [created, setCreated] = useState<string | null>(null);
  const limitReached = tokens.length >= MAX_TOKENS_PER_USER;
  const day = (date: Date) => format.dateTime(date, { dateStyle: "medium" });

  function create() {
    run(
      () => createTokenAction(name),
      (data) => {
        setCreated(data.token);
        setName("");
        toast.success(t("integrations.tokens.created"));
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="text-muted-foreground size-5" aria-hidden />
          {t("integrations.tokens.title")}
        </CardTitle>
        <CardDescription>{t("integrations.tokens.description", { max: MAX_TOKENS_PER_USER })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {created ? (
          <div role="status" className="border-primary bg-primary/5 grid gap-3 rounded-lg border p-3">
            <p className="text-sm font-medium">{t("integrations.tokens.newTitle")}</p>
            <code className="bg-background rounded-md border px-3 py-2 font-mono text-sm break-all select-all">{created}</code>
            <p className="text-muted-foreground text-sm">{t("integrations.tokens.newHint")}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={created} label={t("integrations.tokens.copy")} variant="default" />
              <Button type="button" variant="outline" onClick={() => setCreated(null)}>
                {t("integrations.tokens.dismiss")}
              </Button>
            </div>
          </div>
        ) : null}

        {tokens.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("integrations.tokens.empty")}</p>
        ) : (
          <ul className="grid gap-2">
            {tokens.map((token) => (
              <li key={token.id} className="flex items-start gap-2 rounded-lg border py-2 pr-1 pl-3">
                <div className="grid min-w-0 flex-1 gap-0.5 py-1">
                  <p className="text-sm font-medium break-words">{token.name}</p>
                  <p className="text-muted-foreground font-mono text-xs break-all">
                    {t("integrations.tokens.startsWith", { prefix: token.prefix })}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {[
                      t("integrations.tokens.createdAt", { date: day(token.createdAt) }),
                      token.lastUsedAt
                        ? t("integrations.tokens.lastUsed", { date: day(token.lastUsedAt) })
                        : t("integrations.tokens.neverUsed"),
                    ].join(" · ")}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      aria-label={t("integrations.tokens.delete", { name: token.name })}
                      disabled={pending}
                    >
                      <Trash2Icon aria-hidden />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("integrations.tokens.deleteTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("integrations.tokens.deleteText", { name: token.name })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          run(
                            () => deleteTokenAction(token.id),
                            () => toast.success(t("integrations.tokens.deleted")),
                          )
                        }
                      >
                        {t("common.delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}

        {limitReached ? (
          <p className="text-muted-foreground text-sm">{t("integrations.tokens.limitReached")}</p>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              create();
            }}
          >
            <Field
              id="token-name"
              label={t("integrations.tokens.name")}
              placeholder={t("integrations.tokens.namePlaceholder")}
              maxLength={TOKEN_NAME_MAX_LENGTH}
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" className="justify-self-start" disabled={pending || name.trim() === ""}>
              {t("integrations.tokens.create")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
