import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";
import { ROLES, type Actor, type Role } from "@/domain/permissions/user-management";
import { THEMES, UNIT_SYSTEMS, type Theme, type UnitSystem } from "@/features/users/services/account-service";

export interface CurrentUser extends Actor {
  id: string;
  name: string;
  username: string;
  role: Role;
  theme: Theme;
  unitSystem: UnitSystem;
  sessionToken: string;
}

function pick<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Zugriffsschicht: die einzige Stelle, die die Session liest. Pro Request zwischengespeichert. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Erst die Request-Header lesen: Das macht die Route dynamisch, bevor die
  // Cloudflare-Bindings gebraucht werden (die gibt es nur zur Request-Zeit).
  const requestHeaders = await headers();
  const result = await getAuth().api.getSession({ headers: requestHeaders });
  if (!result) return null;
  const { user, session } = result;
  return {
    id: user.id,
    name: user.name,
    username: user.displayUsername ?? user.username ?? user.name,
    role: pick(ROLES, user.role, "user"),
    theme: pick(THEMES, user.theme, "system"),
    unitSystem: pick(UNIT_SYSTEMS, user.unitSystem, "metric"),
    sessionToken: session.token,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
