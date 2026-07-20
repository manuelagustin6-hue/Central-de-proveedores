'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <>
      {links.map((l) => {
        const active = pathname === l.href || (l.href !== '/dashboard' && pathname.startsWith(l.href));
        return (
          <Link key={l.href} href={l.href} className={active ? 'nav-active' : ''}>
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
