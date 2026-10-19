import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Itechtivity 2027 — Capstone Awards & Bingo Voting",
  description: "Secure, fraud-proof university capstone awards voting and digital bingo system.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="min-h-dvh antialiased flex flex-col font-sans select-none"
      >
        <div className="flex-1 flex flex-col pt-[env(safe-area-inset-top)] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
        <Toaster
          position="top-center"
          offset="max(1.25rem, env(safe-area-inset-top))"
          toastOptions={{
            className: "border border-neutral-300 font-medium text-sm text-neutral-900 bg-white",
          }}
        />
      </body>
    </html>
  );
}
