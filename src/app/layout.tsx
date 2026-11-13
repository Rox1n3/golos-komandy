import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { dictionaries, type Locale } from "@/lib/i18n";
import "./globals.css";

const plex = IBM_Plex_Sans({ subsets: ["latin", "cyrillic", "cyrillic-ext"], weight: ["400", "500", "600", "700"], variable: "--font-plex", display: "swap" });

/** Browser tab title and description in the interface language. */
export async function generateMetadata(): Promise<Metadata> {
  const jar = await cookies();
  const d = dictionaries[jar.get("locale")?.value === "kk" ? "kk" : "ru"];
  return { title: `MODUS TRADE — ${d.brand}`, description: d.metaDescription };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const locale = (jar.get("locale")?.value === "kk" ? "kk" : "ru") as Locale;
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={plex.variable}
    >
      <body className="min-h-dvh">
        <Providers initialLocale={locale}>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
