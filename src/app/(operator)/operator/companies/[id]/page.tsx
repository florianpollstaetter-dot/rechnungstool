"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface CompanyUser {
  auth_user_id: string;
  member_role: string;
  member_since: string;
  display_name: string;
  email: string;
  role: string;
  is_superadmin: boolean;
  banned: boolean;
  last_sign_in: string | null;
}

interface CompanyDetail {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  trial_ends_at: string | null;
  created_at: string;
  subscription_status: "paid" | "outstanding" | "overdue" | null;
  is_free: boolean | null;
  last_payment_at: string | null;
  next_payment_due_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  user_count: number;
  receipt_count: number;
  invoice_count: number;
  users: CompanyUser[];
}

const PAYMENT_BADGES: Record<string, { label: string; cls: string }> = {
  paid: { label: "Bezahlt", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  outstanding: { label: "Offen", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  overdue: { label: "Überfällig", cls: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
};

function daysOverdue(nextDueAt: string | null): number {
  if (!nextDueAt) return 0;
  const due = new Date(nextDueAt).getTime();
  if (Number.isNaN(due)) return 0;
  const diffMs = Date.now() - due;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

const PLAN_BADGES: Record<string, { label: string; cls: string }> = {
  trial: { label: "Trial", cls: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  starter: { label: "Starter", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  pro: { label: "Pro", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  enterprise: { label: "Enterprise", cls: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
};

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  active: { label: "Aktiv", cls: "bg-emerald-500/10 text-emerald-600" },
  suspended: { label: "Gesperrt", cls: "bg-rose-500/10 text-rose-600" },
  cancelled: { label: "Gekündigt", cls: "bg-gray-500/10 text-gray-500" },
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  manager: "Geschäftsführer",
  accountant: "Buchhalter",
  employee: "Mitarbeiter",
};

export default function OperatorCompanyDetail() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.id as string;

  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [actionUser, setActionUser] = useState<CompanyUser | null>(null);
  const [flash, setFlash] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/operator/companies/${companyId}`);
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/operator"); return; }
    if (res.status === 404) { setError("Firma nicht gefunden"); setLoading(false); return; }
    if (!res.ok) { setError("Fehler beim Laden"); setLoading(false); return; }
    setCompany(await res.json());
    setLoading(false);
  }, [companyId, router]);

  useEffect(() => { load(); }, [load]);

  async function saveCompany(updates: Record<string, unknown>) {
    const res = await fetch("/api/operator/companies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: companyId, ...updates }),
    });
    if (res.ok) {
      await load();
      setEditing(false);
    }
  }

  async function handleUserAction(user: CompanyUser, action: string) {
    const res = await fetch("/api/operator/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth_user_id: user.auth_user_id, action, plan: user.email }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (action === "reset_password" && data.recovery_link) {
        setFlash(`Passwort-Reset Link: ${data.recovery_link}`);
      } else {
        setFlash("Erledigt");
      }
      await load();
      setActionUser(null);
    }
  }

  if (loading) return <div className="text-[var(--text-muted)] text-sm py-8 text-center">Lade Firma...</div>;
  if (error) return (
    <div className="text-center py-8">
      <div className="text-rose-500 text-sm mb-2">{error}</div>
      <Link href="/operator/companies" className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">← Zurück zu Firmen</Link>
    </div>
  );
  if (!company) return null;

  const planBadge = PLAN_BADGES[company.plan] || { label: company.plan, cls: "bg-gray-500/10 text-gray-500" };
  const statusBadge = STATUS_BADGES[company.status] || { label: company.status, cls: "bg-gray-500/10 text-gray-500" };
  const trialExpired = company.trial_ends_at && new Date(company.trial_ends_at) < new Date();
  const subStatus = company.subscription_status || "paid";
  const paymentBadge = company.is_free
    ? { label: "Gratis", cls: "bg-sky-500/10 text-sky-600 border-sky-500/20" }
    : PAYMENT_BADGES[subStatus] || PAYMENT_BADGES.paid;
  const overdueDays = !company.is_free && subStatus === "overdue"
    ? daysOverdue(company.next_payment_due_at)
    : 0;

  return (
    <div>
      <Link href="/operator/companies" className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors inline-block mb-2">
        ← Firmen
      </Link>

      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{company.name}</h1>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">Kürzel: {company.slug} · ID: {company.id}</div>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="px-3 py-1.5 text-xs font-medium bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] rounded-md hover:bg-[var(--surface-hover)] transition-colors"
        >
          Firma bearbeiten
        </button>
      </div>

      {flash && (
        <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-600 break-all">
          {flash}
          <button onClick={() => setFlash("")} className="ml-2 text-emerald-700 underline">schließen</button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <InfoCard label="Plan">
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${planBadge.cls}`}>{planBadge.label}</span>
        </InfoCard>
        <InfoCard label="Status">
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge.cls}`}>{statusBadge.label}</span>
        </InfoCard>
        <InfoCard label="Trial endet">
          {company.trial_ends_at ? (
            <span className={`text-xs ${trialExpired ? "text-rose-500" : "text-[var(--text-primary)]"}`}>
              {new Date(company.trial_ends_at).toLocaleDateString("de-AT")}
              {trialExpired && " (abgelaufen)"}
            </span>
          ) : <span className="text-xs text-[var(--text-muted)]">—</span>}
        </InfoCard>
        <InfoCard label="Erstellt">
          <span className="text-xs text-[var(--text-primary)]">{new Date(company.created_at).toLocaleDateString("de-AT")}</span>
        </InfoCard>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <InfoCard label="Zahlung">
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${paymentBadge.cls}`}>
            {paymentBadge.label}{overdueDays > 0 ? ` · ${overdueDays}T` : ""}
          </span>
        </InfoCard>
        <InfoCard label="Letzte Zahlung">
          {company.last_payment_at ? (
            <span className="text-xs text-[var(--text-primary)]">
              {new Date(company.last_payment_at).toLocaleDateString("de-AT")}
            </span>
          ) : <span className="text-xs text-[var(--text-muted)]">—</span>}
        </InfoCard>
        <InfoCard label="Nächste Fälligkeit">
          {company.next_payment_due_at ? (
            <span className={`text-xs ${overdueDays > 0 ? "text-rose-500" : "text-[var(--text-primary)]"}`}>
              {new Date(company.next_payment_due_at).toLocaleDateString("de-AT")}
            </span>
          ) : <span className="text-xs text-[var(--text-muted)]">—</span>}
        </InfoCard>
        <InfoCard label="Stripe">
          {company.stripe_customer_id ? (
            <span className="text-xs text-[var(--text-primary)] font-mono break-all">{company.stripe_customer_id}</span>
          ) : <span className="text-xs text-[var(--text-muted)]">nicht verknüpft</span>}
        </InfoCard>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <MetricCard label="User" value={company.user_count} />
        <MetricCard label="Belege" value={company.receipt_count} />
        <MetricCard label="Rechnungen" value={company.invoice_count} />
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">User ({company.user_count})</h2>
      </div>

      <div className="space-y-2">
        {company.users.map((u) => (
          <div key={u.auth_user_id} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 hover:border-[var(--text-muted)] transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-[var(--text-primary)]">{u.display_name || "Kein Name"}</span>
                  {u.is_superadmin && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-rose-500/10 text-rose-500 rounded">SUPERADMIN</span>
                  )}
                  {u.banned && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-red-500/10 text-red-600 rounded">GESPERRT</span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{u.email}</div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-xs text-[var(--text-secondary)]">
                    {ROLE_LABELS[u.member_role] || u.member_role}
                  </span>
                  {u.last_sign_in && (
                    <span className="text-xs text-[var(--text-muted)]">
                      Letzter Login: {new Date(u.last_sign_in).toLocaleDateString("de-AT")}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setActionUser(u)}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
              >
                Aktionen
              </button>
            </div>
          </div>
        ))}
        {company.users.length === 0 && (
          <div className="text-center text-[var(--text-muted)] text-sm py-6">Keine User in dieser Firma</div>
        )}
      </div>

      {editing && (
        <EditCompanyModal
          company={company}
          onClose={() => setEditing(false)}
          onSave={saveCompany}
        />
      )}

      {actionUser && (
        <UserActionsModal
          user={actionUser}
          onClose={() => setActionUser(null)}
          onAction={handleUserAction}
        />
      )}
    </div>
  );
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
      <div className="text-xs text-[var(--text-muted)] mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
      <div className="text-xs text-[var(--text-muted)] mb-1">{label}</div>
      <div className="text-lg font-bold font-mono text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

function EditCompanyModal({
  company,
  onClose,
  onSave,
}: {
  company: CompanyDetail;
  onClose: () => void;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
}) {
  const [plan, setPlan] = useState(company.plan);
  const [status, setStatus] = useState(company.status);
  const [trialEndsAt, setTrialEndsAt] = useState(
    company.trial_ends_at ? company.trial_ends_at.split("T")[0] : "",
  );
  const [isFree, setIsFree] = useState(!!company.is_free);
  const [subscriptionStatus, setSubscriptionStatus] = useState<"paid" | "outstanding" | "overdue">(
    company.subscription_status || "paid",
  );
  const [lastPaymentAt, setLastPaymentAt] = useState(
    company.last_payment_at ? company.last_payment_at.split("T")[0] : "",
  );
  const [nextPaymentDueAt, setNextPaymentDueAt] = useState(
    company.next_payment_due_at ? company.next_payment_due_at.split("T")[0] : "",
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const updates: Record<string, unknown> = {};
    if (plan !== company.plan) updates.plan = plan;
    if (status !== company.status) updates.status = status;
    if (trialEndsAt && trialEndsAt !== (company.trial_ends_at || "").split("T")[0]) {
      updates.trial_ends_at = new Date(trialEndsAt).toISOString();
    }
    if (isFree !== !!company.is_free) updates.is_free = isFree;
    if (subscriptionStatus !== (company.subscription_status || "paid")) {
      updates.subscription_status = subscriptionStatus;
    }
    const origLast = (company.last_payment_at || "").split("T")[0];
    if (lastPaymentAt !== origLast) {
      updates.last_payment_at = lastPaymentAt ? new Date(lastPaymentAt).toISOString() : null;
    }
    const origNext = (company.next_payment_due_at || "").split("T")[0];
    if (nextPaymentDueAt !== origNext) {
      updates.next_payment_due_at = nextPaymentDueAt ? new Date(nextPaymentDueAt).toISOString() : null;
    }
    if (Object.keys(updates).length > 0) {
      await onSave(updates);
    } else {
      onClose();
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-6">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">{company.name} bearbeiten</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">ID: {company.id}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/50">
              <option value="trial">Trial</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/50">
              <option value="active">Aktiv</option>
              <option value="suspended">Gesperrt</option>
              <option value="cancelled">Gekündigt</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Trial endet am</label>
            <input type="date" value={trialEndsAt} onChange={(e) => setTrialEndsAt(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/50" />
          </div>

          <div className="pt-3 border-t border-[var(--border)]">
            <div className="text-xs font-semibold text-[var(--text-primary)] mb-2">Zahlung</div>
            <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isFree}
                onChange={(e) => setIsFree(e.target.checked)}
                className="accent-rose-500"
              />
              Gratis (von Zahlungsstatus ausgenommen)
            </label>
            <div className={isFree ? "opacity-50 pointer-events-none" : ""}>
              <div className="mb-3">
                <label className="block text-xs text-[var(--text-muted)] mb-1">Zahlungsstatus</label>
                <select
                  value={subscriptionStatus}
                  onChange={(e) => setSubscriptionStatus(e.target.value as "paid" | "outstanding" | "overdue")}
                  disabled={isFree}
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                >
                  <option value="paid">Bezahlt</option>
                  <option value="outstanding">Offen</option>
                  <option value="overdue">Überfällig</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Letzte Zahlung</label>
                  <input type="date" value={lastPaymentAt} onChange={(e) => setLastPaymentAt(e.target.value)}
                    disabled={isFree}
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Nächste Fälligkeit</label>
                  <input type="date" value={nextPaymentDueAt} onChange={(e) => setNextPaymentDueAt(e.target.value)}
                    disabled={isFree}
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/50" />
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-2">
                Stripe-IDs werden automatisch gesetzt, sobald die Stripe-Integration live ist.
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Abbrechen</button>
          <button onClick={handleSave} disabled={saving}
            className="px-3 py-1.5 text-xs font-medium bg-rose-500 text-white rounded-md hover:bg-rose-600 disabled:opacity-50 transition-colors">
            {saving ? "Speichere..." : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserActionsModal({
  user,
  onClose,
  onAction,
}: {
  user: CompanyUser;
  onClose: () => void;
  onAction: (user: CompanyUser, action: string) => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">{user.display_name || "Kein Name"}</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">{user.email}</p>
        <div className="space-y-2">
          {!user.banned ? (
            <button
              onClick={() => onAction(user, "suspend")}
              className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-rose-500/10 text-rose-500 transition-colors"
            >
              Account sperren
            </button>
          ) : (
            <button
              onClick={() => onAction(user, "unsuspend")}
              className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-emerald-500/10 text-emerald-500 transition-colors"
            >
              Sperre aufheben
            </button>
          )}
          <button
            onClick={() => onAction(user, "reset_password")}
            className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] transition-colors"
          >
            Passwort-Reset Link generieren
          </button>
        </div>
        <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg p-3 mt-3 text-xs text-[var(--text-muted)]">
          <div>Firmen-Rolle: {ROLE_LABELS[user.member_role] || user.member_role}</div>
          <div>Profil-Rolle: {ROLE_LABELS[user.role] || user.role}</div>
          <div>Mitglied seit: {new Date(user.member_since).toLocaleDateString("de-AT")}</div>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
