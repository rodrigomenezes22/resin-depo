"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ship } from "lucide-react";

import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/auth/logout-button";

const NAV = [
  { href: "/shipments", label: "Shipments" },
  { href: "/settings/parties", label: "Parties" },
  { href: "/settings/products", label: "Products" },
  { href: "/settings/ports", label: "Ports" },
  { href: "/settings/company", label: "Company & Bank" },
] as const;

export function AppNav({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <header className="bg-card border-border sticky top-0 z-30 border-b">
      <div className="mx-auto flex h-12 w-full max-w-[1600px] items-center gap-6 px-4">
        <Link href="/shipments" className="flex items-center gap-2 font-semibold">
          <Ship className="text-tpe-gold-ink size-5" />
          <span>Resin Depo</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  active
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="text-muted-foreground ml-auto flex items-center gap-3 text-xs">
          <span className="hidden sm:inline">{email}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
