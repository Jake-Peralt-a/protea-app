import type { Metadata } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Future Protea — Registration",
  description:
    "Register for the Future Protea application with identity verification and administrator approval.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${jakarta.variable} ${plexMono.variable}`}
      // The theme-init script below sets data-theme on this element before
      // hydration; the resulting server/client attribute mismatch is expected
      // and intentional.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Set the theme attribute before hydration so switching themes never
            flashes the wrong palette on load. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`}
        </Script>
        {children}
      </body>
    </html>
  );
}
