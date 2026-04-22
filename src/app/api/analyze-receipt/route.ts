import { callClaude, calculateCostEUR } from "@/lib/ai-client";
import { requireCompanyMembership } from "@/lib/api-auth";

export async function POST(request: Request) {
  const { receiptId, companyId } = await request.json();
  if (!receiptId) return Response.json({ error: "receiptId required" }, { status: 400 });

  const auth = await requireCompanyMembership(companyId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const supabase = auth.service;

  // Get receipt AND verify tenant ownership in one query
  const { data: receipt } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", receiptId)
    .eq("company_id", companyId)
    .single();
  if (!receipt) return Response.json({ error: "Receipt not found" }, { status: 404 });

  // Update status to analyzing
  {
    const { error: statusErr } = await supabase
      .from("receipts")
      .update({ analysis_status: "analyzing" })
      .eq("id", receiptId);
    if (statusErr) {
      return Response.json({ error: `Could not mark as analyzing: ${statusErr.message}` }, { status: 500 });
    }
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

    // Build content blocks
    const content: Array<Record<string, unknown>> = [];
    if (isImage) {
      content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } });
    } else {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } });
    }
    content.push({
      type: "text",
      text: `Analysiere diesen Beleg/Rechnung (oesterreichisches Steuerrecht). Extrahiere folgende Felder als JSON:
{
  "invoice_date": "YYYY-MM-DD oder null",
  "purpose": "Verwendungszweck/Beschreibung (kurz)",
  "issuer": "Ausstellende Firma/Person",
  "amount_net": Gesamter Nettobetrag als Zahl oder null,
  "amount_gross": Gesamter Bruttobetrag als Zahl oder null,
  "amount_vat": Gesamter USt-Betrag als Zahl oder null,
  "vat_rate": Haupt-USt-Satz als Zahl (z.B. 20) oder null,
  "vat_details": [{"rate": 20, "net": 100, "vat": 20, "gross": 120}, ...] oder [] (fuer jeden USt-Satz einzeln, z.B. 10% Getraenke, 13% Kultur, 20% Standard),
  "account_debit": "Empfohlenes Soll-Konto (oesterreichischer Kontenrahmen, z.B. 7200 Büroaufwand, 5880 Reisekosten, 7600 Telefonkosten)",
  "account_label": "Kontobeschreibung",
  "payment_method": "bar" oder "karte" oder "überweisung" oder "paypal" oder "sonstige" (erkenne aus Beleg ob Kartenzahlung, Barzahlung, etc.)
}
Antworte NUR mit dem JSON, kein anderer Text.`,
    });

    // Call Claude via Bedrock (EU) or direct API fallback
    const { text: rawText, inputTokens, outputTokens } = await callClaude(content);

    const costEUR = calculateCostEUR(inputTokens, outputTokens);
    const previousCost = Number(receipt.analysis_cost) || 0;
    const totalCost = Math.round((previousCost + costEUR) * 10000) / 10000;

    // Parse the JSON response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // Update the receipt — only fill empty fields, don't overwrite manual entries
    const updates: Record<string, unknown> = {
      analysis_status: "done",
      analysis_raw: { ...parsed, usage: { input_tokens: inputTokens, output_tokens: outputTokens }, cost_eur: costEUR, total_cost_eur: totalCost },
      analysis_cost: totalCost,
      updated_at: new Date().toISOString(),
    };
    if (!receipt.invoice_date && parsed.invoice_date) updates.invoice_date = parsed.invoice_date;
    if (!receipt.purpose && parsed.purpose) updates.purpose = parsed.purpose;
    if (!receipt.issuer && parsed.issuer) updates.issuer = parsed.issuer;
    if (receipt.amount_net == null && parsed.amount_net != null) updates.amount_net = parsed.amount_net;
    if (receipt.amount_gross == null && parsed.amount_gross != null) updates.amount_gross = parsed.amount_gross;
    if (receipt.amount_vat == null && parsed.amount_vat != null) updates.amount_vat = parsed.amount_vat;
    if (receipt.vat_rate == null && parsed.vat_rate != null) updates.vat_rate = parsed.vat_rate;
    if (!receipt.account_debit && parsed.account_debit) updates.account_debit = parsed.account_debit;
    if (!receipt.account_label && parsed.account_label) updates.account_label = parsed.account_label;
    if (!receipt.payment_method && parsed.payment_method) updates.payment_method = parsed.payment_method;

    const { error: saveErr } = await supabase.from("receipts").update(updates).eq("id", receiptId);
    if (saveErr) {
      return Response.json({ error: `Analyse erkannt, konnte aber nicht gespeichert werden: ${saveErr.message}` }, { status: 500 });
    }

    return Response.json({ success: true, data: parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { error: errorSaveErr } = await supabase.from("receipts").update({
      analysis_status: "error",
      analysis_raw: { error: message },
      updated_at: new Date().toISOString(),
    }).eq("id", receiptId);
    if (errorSaveErr) console.error("analyze-receipt: could not record error status:", errorSaveErr.message);
    return Response.json({ error: message }, { status: 500 });
  }
}
