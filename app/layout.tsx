import type { Metadata } from "next";
import "./globals.css";
import "./household-theme.css";

export const metadata: Metadata = {
  title: "Household — Chores together",
  description: "A calm shared space for household chores and fair weekly rotation.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Household", statusBarStyle: "default" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
