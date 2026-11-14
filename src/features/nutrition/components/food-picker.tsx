"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, PlusIcon, ScanBarcodeIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/forms/choice";
import type { AmountUnit, FoodItem } from "@/domain/nutrition/types";
import { formatNumber } from "@/lib/format";
import { addFoodAction, deleteCustomFoodAction, getFoodAction, lookupBarcodeAction, searchFoodsAction } from "../actions";
import { toAddFoodInput, type AddTarget } from "../add-target";
import type { FoodSuggestion } from "../services/diary-service";
import { AmountDialog, type AmountPreset } from "./amount-dialog";
import { BarcodeScanner } from "./barcode-scanner";

const TABS = ["recent", "frequent", "own", "recipes"] as const;
type Tab = (typeof TABS)[number];
const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

interface FoodPickerProps {
  target: AddTarget;
  returnTo: string;
  /** Parameter des Ziels, um nach „Eigenes Lebensmittel anlegen“ hierher zurückzukehren. */
  targetQuery: string;
  recent: FoodSuggestion[];
  frequent: FoodSuggestion[];
  own: FoodItem[];
  recipes: FoodItem[];
  /** Lebensmittel, dessen Mengendialog sofort geöffnet wird (z. B. ein Rezept). */
  initialFood: FoodItem | null;
}

export function FoodPicker({ target, returnTo, targetQuery, recent, frequent, own, recipes, initialFood }: FoodPickerProps) {
  const t = useTranslations("nutrition");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodItem[] | null>(null);
  const [remoteState, setRemoteState] = useState<"idle" | "loading" | "failed">("idle");
  const [tab, setTab] = useState<Tab>("recent");
  const [selected, setSelected] = useState<{ food: FoodItem; preset?: AmountPreset } | null>(
    initialFood ? { food: initialFood } : null,
  );
  const [scanning, setScanning] = useState(false);
  const [missingBarcode, setMissingBarcode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const latestQuery = useRef("");

  const trimmed = query.trim();
  const searching = trimmed.length >= MIN_QUERY_LENGTH;
  const availableTabs = TABS.filter((item) => item !== "recipes" || target.target !== "recipe");

  function changeQuery(value: string) {
    setQuery(value);
    setRemoteState("idle");
    setResults(null);
    setMissingBarcode(null);
  }

  // Lokale Suche beim Tippen: eigene, eingebaute und bereits bekannte Produkte.
  useEffect(() => {
    latestQuery.current = trimmed;
    if (trimmed.length < MIN_QUERY_LENGTH) return;
    const timer = window.setTimeout(async () => {
      const result = await searchFoodsAction(trimmed, false);
      if (latestQuery.current === trimmed && result.ok) setResults(result.data);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [trimmed]);

  async function searchRemote() {
    setRemoteState("loading");
    const result = await searchFoodsAction(trimmed, true);
    if (latestQuery.current !== trimmed) return;
    if (!result.ok) {
      setRemoteState("failed");
      return;
    }
    setRemoteState("idle");
    setResults((current) => {
      const known = new Set((current ?? []).map((item) => item.ref));
      return [...(current ?? []), ...result.data.filter((item) => !known.has(item.ref))];
    });
  }

  function pickSuggestion(suggestion: FoodSuggestion) {
    startTransition(async () => {
      const result = await getFoodAction(suggestion.foodRef);
      if (result.ok) {
        setSelected({ food: result.data, preset: { amount: suggestion.amount, amountUnit: suggestion.amountUnit } });
      } else {
        toast.error(tErrors(result.error));
      }
    });
  }

  function handleBarcode(barcode: string) {
    setScanning(false);
    startTransition(async () => {
      const result = await lookupBarcodeAction(barcode);
      if (!result.ok) toast.error(t("add.remoteFailed"));
      else if (result.data) setSelected({ food: result.data });
      else setMissingBarcode(barcode);
    });
  }

  function submit(food: FoodItem, amount: number, unit: AmountUnit) {
    startTransition(async () => {
      const result = await addFoodAction(toAddFoodInput(target, food.ref, amount, unit));
      if (!result.ok) {
        toast.error(tErrors(result.error));
        return;
      }
      toast.success(t("add.added", { name: food.name }));
      router.push(returnTo);
    });
  }

  function removeOwn(food: FoodItem) {
    startTransition(async () => {
      const result = await deleteCustomFoodAction(food.ref);
      if (result.ok) {
        toast.success(t("add.ownDeleted"));
        router.refresh();
      } else {
        toast.error(tErrors(result.error));
      }
    });
  }

  const basisLabel = (food: FoodItem) =>
    food.basis === "g" ? t("units.per100g") : food.basis === "ml" ? t("units.per100ml") : t("units.perServing");

  const foodRow = (food: FoodItem, onDelete?: () => void) => (
    <li key={food.ref} className="flex items-center">
      <button
        type="button"
        onClick={() => setSelected({ food })}
        className="hover:bg-accent/60 min-h-14 min-w-0 flex-1 px-4 py-2 text-left"
      >
        <span className="block truncate font-medium">{food.name}</span>
        <span className="text-muted-foreground block truncate text-sm">
          {[food.brand, `${formatNumber(food.per.kcal, 0)} ${t("units.kcal")} ${basisLabel(food)}`]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
      {onDelete ? (
        <Button variant="ghost" size="icon" aria-label={t("add.deleteOwn", { name: food.name })} onClick={onDelete} disabled={pending}>
          <Trash2Icon aria-hidden />
        </Button>
      ) : null}
    </li>
  );

  const suggestionList = (items: FoodSuggestion[], emptyText: string) =>
    items.length === 0 ? (
      <p className="text-muted-foreground text-sm">{emptyText}</p>
    ) : (
      <ul className="divide-y rounded-xl border">
        {items.map((item) => (
          <li key={item.foodRef}>
            <button
              type="button"
              disabled={pending}
              onClick={() => pickSuggestion(item)}
              className="hover:bg-accent/60 min-h-14 w-full px-4 py-2 text-left"
            >
              <span className="block truncate font-medium">{item.name}</span>
              <span className="text-muted-foreground block text-sm">
                {t("add.lastAmount", { amount: formatNumber(item.amount), unit: t(`units.${item.amountUnit}`) })}
                {" · "}
                {t("macros.kcalValue", { value: formatNumber(item.kcal, 0) })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );

  const foodList = (items: FoodItem[], emptyText: string, deletable = false) =>
    items.length === 0 ? (
      <p className="text-muted-foreground text-sm">{emptyText}</p>
    ) : (
      <ul className="divide-y rounded-xl border">
        {items.map((food) => foodRow(food, deletable ? () => removeOwn(food) : undefined))}
      </ul>
    );

  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        <Input
          type="search"
          aria-label={t("add.search")}
          placeholder={t("add.search")}
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && searching) void searchRemote();
          }}
        />
        <Button variant="outline" size="icon" aria-label={t("add.scan")} onClick={() => setScanning(true)}>
          <ScanBarcodeIcon aria-hidden />
        </Button>
      </div>

      {missingBarcode ? (
        <div className="grid gap-2 rounded-xl border p-4 text-sm">
          <p>{t("scanner.notFound")}</p>
          <Button asChild variant="outline" className="justify-self-start">
            <Link href={`/nutrition/foods/new?${targetQuery}&barcode=${missingBarcode}`}>
              <PlusIcon aria-hidden />
              {t("scanner.createWithBarcode")}
            </Link>
          </Button>
        </div>
      ) : null}

      {searching ? (
        <>
          {results === null ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
            </p>
          ) : (
            foodList(results, t("add.noResults"))
          )}
          <Button variant="outline" onClick={() => void searchRemote()} disabled={remoteState === "loading"}>
            {remoteState === "loading" ? (
              <>
                <Loader2Icon className="animate-spin" aria-hidden />
                {t("add.searchingRemote")}
              </>
            ) : (
              t("add.searchRemote")
            )}
          </Button>
          {remoteState === "failed" ? (
            <p role="alert" className="text-destructive text-sm">
              {t("add.remoteFailed")}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div role="radiogroup" className="flex flex-wrap gap-2">
            {availableTabs.map((item) => (
              <Chip key={item} role="radio" selected={tab === item} onToggle={() => setTab(item)}>
                {t(`add.tabs.${item}`)}
              </Chip>
            ))}
          </div>
          {tab === "recent" ? suggestionList(recent, t("add.emptyRecent")) : null}
          {tab === "frequent" ? suggestionList(frequent, t("add.emptyFrequent")) : null}
          {tab === "own" ? foodList(own, t("add.emptyOwn"), true) : null}
          {tab === "recipes" ? foodList(recipes, t("add.emptyRecipes")) : null}
        </>
      )}

      <Button asChild variant="ghost" className="justify-self-start">
        <Link href={`/nutrition/foods/new?${targetQuery}`}>
          <PlusIcon aria-hidden />
          {t("add.createOwn")}
        </Link>
      </Button>

      <BarcodeScanner open={scanning} onClose={() => setScanning(false)} onDetected={handleBarcode} />
      {selected ? (
        <AmountDialog
          key={selected.food.ref}
          food={selected.food}
          preset={selected.preset}
          pending={pending}
          onSubmit={(amount, unit) => submit(selected.food, amount, unit)}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
