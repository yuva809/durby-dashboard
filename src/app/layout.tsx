import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { QueryProvider } from "@/providers/query-provider";
import { RestaurantProvider } from "@/providers/restaurant-provider";
import "./globals.css";

// Variable weight so both the dashboard's regular UI text and the
// marketing site's heavy, tight-tracked display headings come from one
// loaded font — no separate font file for a second weight.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Durby",
  description: "Durby — the AI Operating Manager for restaurants, built by ExtraHand.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className={`dark ${inter.variable}`}>
        <body className="bg-background text-foreground antialiased">
          <QueryProvider>
            <RestaurantProvider>{children}</RestaurantProvider>
          </QueryProvider>
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
