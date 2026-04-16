"use client";

export function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "relative px-3.5 py-2 text-xs font-medium rounded-md",
        "transition-all duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]/50",
        active
          ? "text-[var(--brand-orange)] bg-[var(--brand-orange-dim)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]",
      ].join(" ")}
    >
      {children}
      <span
        className={[
          "absolute -bottom-px left-1/2 -translate-x-1/2 h-0.5 rounded-full",
          "bg-[var(--brand-orange)]",
          "transition-all duration-150 ease-out",
          active ? "w-4/5 opacity-100" : "w-0 opacity-0",
        ].join(" ")}
      />
    </button>
  );
}
