interface PageHeaderProps {
  label: string;
  title: string;
  description?: string;
}

export default function PageHeader({ label, title, description }: PageHeaderProps) {
  return (
    <section className="pt-24 sm:pt-28 md:pt-44 pb-10 md:pb-20 px-6 lg:px-16 bg-surface border-b border-foreground/6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-7 md:mb-16 anim-0">
          <span className="block w-8 h-px bg-moss/50 flex-shrink-0" />
          <p className="text-foreground/28 text-[10px] tracking-[0.5em] uppercase">
            {label}
          </p>
        </div>

        <h1
          className="text-foreground font-bold leading-tight md:leading-[0.86] tracking-tight anim-1"
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "clamp(38px, 9vw, 120px)",
          }}
        >
          {title}
        </h1>

        {description && (
          <>
            <div className="border-t border-foreground/8 mt-7 md:mt-12 pt-7 md:pt-10 anim-2">
              <p className="text-foreground/35 text-[15px] sm:text-base max-w-xl leading-[1.75]">
                {description}
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
