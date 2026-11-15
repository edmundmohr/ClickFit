import { redirect } from "next/navigation";

/** Frühere Adresse der Plan-Übersicht; Lesezeichen und alte Links landen in `/training/plans`. */
export default function RoutinesPage() {
  redirect("/training/plans");
}
