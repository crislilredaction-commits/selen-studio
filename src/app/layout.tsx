import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Selen Studio",
  description: "Pilotage administratif Qualiopi",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
