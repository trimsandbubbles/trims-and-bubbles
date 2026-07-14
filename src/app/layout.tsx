import type { Metadata } from "next";
import { Nunito, Corben, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Wordmark face — a chunky, warm rounded serif (Cooper Black family) that
// matches the "Trims & Bubbles" lettering in the brand logo.
const corben = Corben({
  variable: "--font-corben",
  subsets: ["latin"],
  weight: ["400", "700"],
});

// Everything else — a rounded, friendly humanist sans (the "Nunito" family),
// run a touch heavier per the brand direction.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

// Mono kept for the odd tabular/code label.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Trims and Bubbles | Dog Grooming",
    template: "%s | Trims and Bubbles",
  },
  description:
    "Professional dog washing, grooming and trimming — full grooms, wash & dry, deshedding, nail care, and pickup/drop-off.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${corben.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* overflow-x-hidden is a safety net (not the primary fix — see the
          min-w-0 additions in the area layouts/AdminShell) against any wide
          descendant forcing the page to scroll horizontally; found via the
          Hardening-milestone mobile pass that flex-col layouts nesting a
          wide table can otherwise push the whole body wider than the
          viewport even though the table itself has its own overflow-x-auto. */}
      <body className="min-h-full flex flex-col overflow-x-hidden">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
