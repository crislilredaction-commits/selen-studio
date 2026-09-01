"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SupportQuickCreateLink() {
  const pathname = usePathname();
  if (!pathname.startsWith("/agent/support") || pathname === "/agent/support/new") return null;

  return (
    <Link
      href="/agent/support/new"
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 70,
        textDecoration: "none",
        borderRadius: 999,
        padding: "11px 16px",
        background: "var(--selen-gold2)",
        color: "var(--selen-bg)",
        boxShadow: "0 12px 30px rgba(46, 35, 24, 0.24)",
        fontSize: 12,
        fontWeight: 850,
      }}
    >
      + Ouvrir un ticket
    </Link>
  );
}
