import "./globals.css";
import type { Metadata } from "next";
import { Geist_Mono, Nunito_Sans } from "next/font/google";

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WooCommerce Redirect Payment MVP",
  description:
    "Demo redirect checkout flow with webhook-based source of truth for payment status",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${nunitoSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-cyan-50/45"
      >
        {children}
      </body>
    </html>
  );
}
