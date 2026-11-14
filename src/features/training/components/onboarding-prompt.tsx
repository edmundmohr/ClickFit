import Link from "next/link";
import { ClipboardListIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Illustration } from "@/components/illustration";

/** Hinweis mit Einstieg in den Fragebogen, solange es noch kein Profil gibt. */
export function OnboardingPrompt({ title, text, action }: { title: string; text: string; action: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{text}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Illustration name="onboarding" />
        <Button asChild size="lg" className="w-full">
          <Link href="/onboarding">
            <ClipboardListIcon aria-hidden />
            {action}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
