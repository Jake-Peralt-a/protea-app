import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
