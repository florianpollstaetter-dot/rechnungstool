import { requireSuperadmin, createServiceClient } from "@/lib/operator";

export async function GET() {
  const auth = await requireSuperadmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const service = createServiceClient();

  // Parallel queries for stats
  const [
    companiesRes,
    usersRes,
    invoicesRes,
    receiptsRes,
  ] = await Promise.all([
    service.from("companies").select("id, plan, status, trial_ends_at, created_at"),
    service.from("user_profiles").select("id, created_at"),
    service.from("invoices").select("id, total, status, created_at"),
    service.from("receipts").select("id, created_at"),
  ]);

  const companies = companiesRes.data ?? [];
  const users = usersRes.data ?? [];
  const invoices = invoicesRes.data ?? [];
  const receipts = receiptsRes.data ?? [];

  // Company breakdown by plan
  const planBreakdown: Record<string, number> = {};
  const statusBreakdown: Record<string, number> = {};
  companies.forEach((c: Record<string, unknown>) => {
    const plan = c.plan as string;
    const status = c.status as string;
    planBreakdown[plan] = (planBreakdown[plan] || 0) + 1;
    statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
  });

  // Trial companies expiring soon (next 7 days)
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const expiringTrials = companies.filter((c: Record<string, unknown>) =>
    c.plan === "trial" && c.status === "active" && c.trial_ends_at &&
    new Date(c.trial_ends_at as string) <= weekFromNow &&
    new Date(c.trial_ends_at as string) >= now
  ).length;

  // MRR placeholder (manual plan pricing for now)
  const PLAN_PRICES: Record<string, number> = {
    trial: 0,
    starter: 19,
    pro: 49,
    enterprise: 149,
  };
  const mrr = companies
    .filter((c: Record<string, unknown>) => c.status === "active")
    .reduce((sum: number, c: Record<string, unknown>) => sum + (PLAN_PRICES[c.plan as string] || 0), 0);

  // New companies this month
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const newCompaniesThisMonth = companies.filter(
    (c: Record<string, unknown>) => new Date(c.created_at as string) >= thisMonth
  ).length;
  const newUsersThisMonth = users.filter(
    (u: Record<string, unknown>) => new Date(u.created_at as string) >= thisMonth
  ).length;

  // Invoice revenue (paid invoices)
  const totalRevenue = invoices
    .filter((i: Record<string, unknown>) => i.status === "bezahlt")
    .reduce((sum: number, i: Record<string, unknown>) => sum + Number(i.total || 0), 0);

  return Response.json({
    total_companies: companies.length,
    total_users: users.length,
    total_invoices: invoices.length,
    total_receipts: receipts.length,
    plan_breakdown: planBreakdown,
    status_breakdown: statusBreakdown,
    expiring_trials: expiringTrials,
    mrr,
    new_companies_this_month: newCompaniesThisMonth,
    new_users_this_month: newUsersThisMonth,
    total_revenue: totalRevenue,
  });
}
