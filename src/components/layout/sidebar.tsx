"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  TrendingUp,
  Package,
  CalendarClock,
  ShieldCheck,
  BarChart3,
  Bell,
  Settings,
  UtensilsCrossed,
  Database,
  Plug,
  BookOpen,
  Star,
  Sun,
  ClipboardList,
  UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EXTRAHAND_URL } from "@/lib/config";
import { useRestaurantContext } from "@/providers/restaurant-provider";

const FULL_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/chat", label: "AI Chat", icon: MessageSquare },
  { href: "/dashboard/order", label: "Durby Order", icon: ClipboardList },
  { href: "/dashboard/forecast", label: "Forecast", icon: TrendingUp },
  { href: "/dashboard/data-center", label: "Data Center", icon: Database },
  { href: "/dashboard/menu", label: "Menu", icon: BookOpen },
  { href: "/dashboard/inventory", label: "Inventory", icon: Package },
  { href: "/dashboard/scheduling", label: "Scheduling", icon: CalendarClock },
  { href: "/dashboard/compliance", label: "Compliance", icon: ShieldCheck },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
  { href: "/dashboard/reviews", label: "Reviews", icon: Star },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
  { href: "/dashboard/restaurant-profile", label: "Restaurant Profile", icon: UtensilsCrossed },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

// Service/kitchen staff get a deliberately tiny nav — this should feel
// like a simple employee app, not the full operator dashboard. Profile
// lives behind the avatar (Topbar), not here, for every role.
const SERVICE_NAV_ITEMS = [
  { href: "/dashboard", label: "My Day", icon: Sun },
  { href: "/dashboard/order", label: "Durby Order", icon: ClipboardList },
  { href: "/dashboard/my-work", label: "My Work", icon: UserCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const { role } = useRestaurantContext();
  const navItems = role === "SERVICE" || role === "KITCHEN" ? SERVICE_NAV_ITEMS : FULL_NAV_ITEMS;

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-card/40 px-4 py-6">
      <div className="px-2 mb-8">
        <span className="text-lg font-semibold tracking-tight">
          <span className="text-accent">Durby</span>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          // "/dashboard" is a prefix of every nested route, so it needs an
          // exact match — otherwise the Dashboard/My Day tab would stay
          // lit up alongside whichever sub-page is actually active.
          const active = href === "/dashboard" ? pathname === "/dashboard" : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <a
        href={EXTRAHAND_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 px-3 py-2 text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
      >
        Powered by ExtraHand
      </a>
    </aside>
  );
}
