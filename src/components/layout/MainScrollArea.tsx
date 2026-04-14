'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Null-rendering component: scrolls the nearest <main> to top on navigation.
// Does NOT render any DOM node — avoids conflict with Next.js's ScrollAndFocusHandler.
export function ScrollResetter() {
  const pathname = usePathname();

  useEffect(() => {
    const main = document.querySelector<HTMLElement>('main.content-scroll');
    main?.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}
