"use client";

import { useTranslations } from "@/components/LocaleProvider";

// Client component so it reads the locale from the layout's <LocaleProvider>
// context (special files like loading.tsx don't receive route params). Keeps
// the pages themselves statically renderable.
export default function Loading() {
  const { t } = useTranslations();
  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-5">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full rounded-full bg-moss opacity-60 animate-ping" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-moss" />
        </span>
        <p className="text-foreground/25 text-[10px] tracking-[0.5em] uppercase">
          {t.errors.loading}
        </p>
      </div>
    </div>
  );
}
