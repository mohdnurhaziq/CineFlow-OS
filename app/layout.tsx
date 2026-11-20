import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { SignedOutNotice } from "@/components/auth/signed-out-notice";
import { StaleVersionReload } from "@/components/stale-version-reload";
import { NavigationNudge } from "@/components/navigation-nudge";
import { StagingBar } from "@/components/staging-bar";
import { APP_ENV } from "@/lib/app-env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CineFlow OS — The Creative Operating System",
    template: "%s | CineFlow OS",
  },
  description: "Multi-Tenant Creative Operating System for Photographers & Videographers",
  applicationName: "CineFlow OS",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CineFlow OS",
  },
  // The staging copy is for checking changes, never for search results.
  ...(APP_ENV === "staging" && { robots: { index: false, follow: false } }),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} font-sans bg-[#09090b] text-[#fafafa] antialiased selection:bg-amber-500/20 selection:text-amber-400 min-h-screen flex flex-col`}
      >
        {APP_ENV === "staging" && <StagingBar />}
        {children}
        {/* Reads the URL, so it needs its own Suspense boundary to keep pages static where they can be. */}
        <Suspense fallback={null}>
          <SignedOutNotice />
        </Suspense>
        {/* A page left open across an update reloads itself when its buttons stop working. */}
        <StaleVersionReload />
        {/* A link clicked as a page opens sometimes never shows its page until the next update: nudge it. */}
        <NavigationNudge />
        {/*
          Pop-up messages. Top centre, so a message never sits on the buttons pages keep at the
          bottom of the screen, and just below the area's sticky header when there is one: each
          header's <ToastAnchor /> sets --toast-top to its height.
        */}
        <Toaster
          theme="dark"
          position="top-center"
          offset={{ top: "var(--toast-top, 24px)" }}
          mobileOffset={{ top: "var(--toast-top, 16px)" }}
          toastOptions={{
            style: {
              background: "#121215",
              border: "1px solid #27272a",
              color: "#fafafa",
            },
          }}
        />
      </body>
    </html>
  );
}
