"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dailyStudioNavigationSections, isDailyStudioNavLinkActive } from "@/lib/daily/dailyStudioNavigation.mjs";

export default function DailyStudioNavigation({ owner }: { owner: boolean }) {
  const pathname = usePathname();
  return <nav className="daily-subnav" aria-label="Navigation Selen Daily">
    {dailyStudioNavigationSections(owner).map(group => <div key={group.label} className="daily-subnav-group" role="group" aria-label={group.label}>
      <span className="daily-subnav-group-label">{group.label}</span>
      <div className="daily-subnav-links">
        {group.links.map(link => {
          const active = isDailyStudioNavLinkActive(pathname, link.href);
          return <Link key={link.href} href={link.href} className={"daily-subnav-link" + (link.priority ? " daily-subnav-link--priority" : "")}
            aria-current={active ? "page" : undefined}>{link.label}</Link>;
        })}
      </div>
    </div>)}
  </nav>;
}
