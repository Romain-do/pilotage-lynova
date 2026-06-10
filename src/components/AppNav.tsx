"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconLayoutDashboard,
  IconCoin,
  IconWallet,
  IconUsers,
} from "@tabler/icons-react";
import { Logo } from "./Logo";

type Brand = "lynova" | "evoliz" | "revolut";
const LINKS: { href: string; label: string; Icon: typeof IconCoin; brand: Brand }[] = [
  { href: "/", label: "Cockpit", Icon: IconLayoutDashboard, brand: "lynova" },
  { href: "/facturation", label: "Evoliz", Icon: IconCoin, brand: "evoliz" },
  { href: "/tresorerie", label: "Revolut Business", Icon: IconWallet, brand: "revolut" },
  { href: "/prospection", label: "Prospection", Icon: IconUsers, brand: "lynova" },
];

// État actif (fond de marque). Inactif : translucide sur le bandeau navy.
function activeClass(brand: Brand): string {
  if (brand === "evoliz") return "bg-evoliz text-white";
  if (brand === "revolut") return "bg-black text-white";
  return "bg-cyan/25 text-white";
}

// Header de navigation persistant (toutes les vues). Le DIRIGEANT voit les 4 liens ;
// le COMMERCIAL ne voit que Prospection (RBAC inchangé, garde serveur par ailleurs).
export function AppNav({ role }: { role: string }) {
  const pathname = usePathname();
  const isDirigeant = role === "DIRIGEANT";
  const links = isDirigeant ? LINKS : LINKS.filter((l) => l.href === "/prospection");
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const home = isDirigeant ? "/" : "/prospection";

  const Item = ({ href, label, Icon, brand }: (typeof LINKS)[number]) => {
    const active = isActive(href);
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`inline-flex flex-none items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          active ? activeClass(brand) : "text-white/70 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Icon size={16} stroke={2} className={brand === "evoliz" ? "text-banana" : undefined} />
        {label}
      </Link>
    );
  };

  return (
    <header className="bg-navy text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link href={home} className="flex-none"><Logo className="text-lg text-white" /></Link>
          <nav className="hidden items-center gap-1 md:flex">{links.map((l) => <Item key={l.href} {...l} />)}</nav>
        </div>
        <div className="flex flex-none items-center gap-3">
          {isDirigeant && (
            <Link href="/admin" className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10">
              Administration
            </Link>
          )}
          <form action="/auth/signout" method="post">
            <button type="submit" className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10">
              Se déconnecter
            </button>
          </form>
        </div>
      </div>
      {/* Navigation repliée (mobile) : barre scrollable sous le bandeau */}
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">{links.map((l) => <Item key={l.href} {...l} />)}</nav>
    </header>
  );
}
