import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title:"ACP Shopping Agent", description:"AI shopping agent powered by Agentic Commerce Protocol" };
export default function RootLayout({ children }: { children: React.ReactNode }) { return (<html lang="en"><body>{children}</body></html>); }