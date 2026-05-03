import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ShopACP — Merchant Dashboard",
  description: "ACP merchant store dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
