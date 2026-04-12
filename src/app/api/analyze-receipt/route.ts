import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  const { receiptId } = await request.json();
  if (!receiptId) return Response.json({ error: "receiptId required" }, { status: 400 });

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get receipt
  const { data: receipt } = await supabase.from("receipts").select("*").eq("id", receiptId).single();
  if (!receipt) return Response.json({ error: "Receipt not found" }, { status: 404 });

  // Update status to analyzing
  await supabase.from("receipts").update({ analysis_status: "analyzing" }).eq("id", receiptId);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    await supabase.from("receipts").update({ analysis_status: "error", analysis_raw: { error: "No ANTHROPIC_API_KEY configured" } }).eq("id", receiptId);
    return Response.json({ error: "AI analysis not configured. Set ANTHROPIC_API_KEY in environment." }, { status: 503 });
  }

  try {
    // Download the file from storage
    const { data: fileData } = await supabase.storage.from("receipts").download(receipt.file_path);
    if (!fileData) throw new Error("Could not download file");

    const base64 = Buffer.from(await fileData.arrayBuffer()).toString("base64");
    const isImage = ["png", "jpg", "jpeg"].includes(receipt.file_type);
    const mediaType = isImage
      ? (`image/${receipt.file_type === "jpg" ? "jpeg" : receipt.file_type}` as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
      : "application/pdf";

    // Call Claude API
    const content: Array<Record<string, unknown>> = [];
    if (isImage) {
      content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } });
    } else {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } });
    }
    content.push({
      type: "text",
      text: `Analysiere diesen Beleg/Rechnung. Extrahiere folgende Felder als JSON:
{
  "invoice_date": "YYYY-MM-DD oder null",
  "purpose": "Verwendungszweck/Beschreibung",
  "issuer": "Ausstellende Firma/Person",
  "amount_net": Nettobetrag als Zahl oder null,
  "amount_gross": Bruttobetrag als Zahl oder null,
  "amount_vat": USt-Betrag als Zahl oder null,
  "vat_rate": USt-Satz als Zahl (z.B. 20) oder null,
  "account_debit": "Empfohlenes Soll-Konto (oesterreichischer Kontenrahmen, z.B. 7200 fuer Bueroaufwand)",
  "account_label": "Kontobeschreibung (z.B. Bueroaufwand)"
}
Antworte NUR mit dem JSON, kein anderer Text.`,
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error: ${response.status} ${err}`);
    }

    const result = await response.json();
    const textBlock = result.content?.find((b: Record<string, string>) => b.type === "text");
    const rawText = textBlock?.text || "{}";

    // Parse the JSON response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // Update the receipt with analyzed data
    await supabase.from("receipts").update({
      analysis_status: "done",
      analysis_raw: parsed,
      invoice_date: parsed.invoice_date || null,
      purpose: parsed.purpose || null,
      issuer: parsed.issuer || null,
      amount_net: parsed.amount_net ?? null,
      amount_gross: parsed.amount_gross ?? null,
      amount_vat: parsed.amount_vat ?? null,
      vat_rate: parsed.vat_rate ?? null,
      account_debit: parsed.account_debit || null,
      account_label: parsed.account_label || null,
      updated_at: new Date().toISOString(),
    }).eq("id", receiptId);

    return Response.json({ success: true, data: parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("receipts").update({
      analysis_status: "error",
      analysis_raw: { error: message },
      updated_at: new Date().toISOString(),
    }).eq("id", receiptId);
    return Response.json({ error: message }, { status: 500 });
  }
}
