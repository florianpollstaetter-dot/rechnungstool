// ORA-2283 — Treasury sub-layout.
//
// Wraps every /treasury/* page with the Treasury sub-navigation (tabs across
// the top). Sits inside the (app) route group so it inherits the global
// AppSidebar + AppFooter + ChatWidget shell from `(app)/layout.tsx`.
//
// Feature-flag enforcement: the route is already gated by middleware.ts
// (returns 404 when has_treasury=false). This layout assumes Treasury is
// active; pages don't need to re-check.

import TreasuryTabBar from "@/components/treasury/TreasuryTabBar";

export default function TreasuryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <TreasuryTabBar />
      <div>{children}</div>
    </div>
  );
}
