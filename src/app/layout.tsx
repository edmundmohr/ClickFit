import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { LOCALE } from "@/i18n/config";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: { default: t("common.appName"), template: `%s · ${t("common.appName")}` },
    description: t("meta.description"),
    applicationName: t("common.appName"),
    appleWebApp: { capable: true, title: t("common.appName"), statusBarStyle: "black-translucent" },
    icons: {
      icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Verhindert am iPhone das Hineinzoomen beim Antippen von Feldern nicht durch Sperren des
  // Zooms, sondern durch 16-px-Schrift in Eingabefeldern (siehe components/ui).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={LOCALE}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground min-h-full">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
