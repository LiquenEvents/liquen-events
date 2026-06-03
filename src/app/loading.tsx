import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n";

export default async function Loading() {
  const t = getDictionary(await getLocale());
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
