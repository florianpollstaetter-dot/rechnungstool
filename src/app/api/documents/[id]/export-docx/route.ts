import { NextRequest, NextResponse } from "next/server";
import { requireCompanyMembership } from "@/lib/api-auth";
import { markdownToDocxBuffer } from "@/lib/docx-export";

// POST /api/documents/[id]/export-docx
// Body: { companyId: string }
// Converts the stored Markdown body to a DOCX binary.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => ({})) as { companyId?: string };
  const auth = await requireCompanyMembership(body.companyId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { data, error } = await auth.service
    .from("company_documents")
    .select("id, title, body")
    .eq("company_id", body.companyId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const docxBuffer = await markdownToDocxBuffer(data.body, data.title);
  const safeTitle = data.title.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, "").trim() || "document";
  const bodyBytes = new Uint8Array(docxBuffer);

  return new Response(bodyBytes, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeTitle}.docx"`,
    },
  });
}
