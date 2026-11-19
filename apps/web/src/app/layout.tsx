import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { LanguageProvider } from "@/components/LanguageControl";
import { ThemeProvider } from "@/components/ThemeControl";
import "./globals.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Weather Report – Official",
  description: "Mappe dei modelli meteorologici ECMWF, aggiornate a ogni run.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" data-theme="system">
      <body className={plex.className}>
        <LanguageProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
