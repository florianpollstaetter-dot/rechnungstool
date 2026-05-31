import { NextRequest, NextResponse } from "next/server";
import { requireCompanyMembership } from "@/lib/api-auth";

// GET /api/documents/[id]?companyId=...
// The dynamic segment carries the document key slug (lastenheft, plan, piercing, …).
// Slug is named `id` to match the sibling `[id]/export-docx` route — Next.js
// requires identical slug names at the same path position.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const auth = await requireCompanyMembership(companyId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: key } = await params;
  if (!key?.trim()) {
    return NextResponse.json({ error: "key required" }, { status: 400 });
  }

  const { data, error } = await auth.service
    .from("company_documents")
    .select("id, key, title, body, updated_at")
    .eq("company_id", companyId)
    .eq("key", key)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: data.id,
    key: data.key,
    title: data.title,
    body: data.body,
    updatedAt: data.updated_at,
  });
}
