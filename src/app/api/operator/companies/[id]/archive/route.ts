import { requireSuperadmin, createServiceClient, logOperatorAction } from "@/lib/operator";

// SCH-962 — toggle companies.archived_at via operator console.
// Body: { archived: boolean } — true sets archived_at = now(), false clears it.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSuperadmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const archived = Boolean(body?.archived);

  const service = createServiceClient();
  const { data, error } = await service
    .from("companies")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Unternehmen nicht gefunden" }, { status: 404 });

  await logOperatorAction(
    auth.user!.id,
    archived ? "company.archive" : "company.unarchive",
    "company",
    id,
    { archived },
  );

  return Response.json(data);
}
