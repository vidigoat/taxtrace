import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaxTrace — Open public spending forensics",
  description:
    "Every federal dollar. Every contract. Every connection. Open-source platform for searching, visualizing, and auditing US federal spending.",
  openGraph: {
    title: "TaxTrace",
    description: "Open public spending forensics. Every federal dollar.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-white text-neutral-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
