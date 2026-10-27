"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dailyStudioNavigationSections, isDailyStudioNavSectionActive } from "@/lib/daily/dailyStudioNavigation.mjs";

/** Cinq entrées métier. Les outils secondaires sont regroupés dans Administration. */
export default function DailyStudioNavigation({ owner }: { owner: boolean }) {
  const pathname = usePathname();
  return <nav className="daily-subnav" aria-label="Navigation Selen Daily">
    {dailyStudioNavigationSections(owner).map(group => <div key={group.label} className="daily-subnav-group" role="group" aria-label={group.label}>
      <div className="daily-subnav-links">
        {group.links.map(link => {
          const active = isDailyStudioNavSectionActive(pathname, group);
          return <Link key={link.href} href={link.href} className="daily-subnav-link"
            aria-current={active ? "page" : undefined}>{link.label}</Link>;
        })}
      </div>
    </div>)}
  </nav>;
}
