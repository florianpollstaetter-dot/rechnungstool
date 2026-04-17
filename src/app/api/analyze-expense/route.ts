import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  const { expenseItemId } = await request.json();
  if (!expenseItemId) return Response.json({ error: "expenseItemId required" }, { status: 400 });

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get expense item
  const { data: item } = await supabase.from("expense_items").select("*").eq("id", expenseItemId).single();
  if (!item) return Response.json({ error: "Expense item not found" }, { status: 404 });
  if (!item.receipt_file_path) return Response.json({ error: "No receipt file attached" }, { status: 400 });

  // Update status to analyzing
  await supabase.from("expense_items").update({ analysis_status: "analyzing" }).eq("id", expenseItemId);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    await supabase.from("expense_items").update({ analysis_status: "error", analysis_raw: { error: "No ANTHROPIC_API_KEY configured" } }).eq("id", expenseItemId);
    return Response.json({ error: "AI analysis not configured. Set ANTHROPIC_API_KEY in environment." }, { status: 503 });
  }

  try {
    // Download the file from storage
    const { data: fileData } = await supabase.storage.from("receipts").download(item.receipt_file_path);
    if (!fileData) throw new Error("Could not download file");

    const base64 = Buffer.from(await fileData.arrayBuffer()).toString("base64");
    const fileType = (item.receipt_file_type || item.receipt_file_path.split(".").pop() || "jpg").toLowerCase();
    const isImage = ["png", "jpg", "jpeg"].includes(fileType);
    const mediaType = isImage
      ? (`image/${fileType === "jpg" ? "jpeg" : fileType}` as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
      : "application/pdf";

    // Call Claude API — same prompt as receipt analysis
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
  "payment_method": "bar" oder "karte" oder "überweisung" oder "paypal" oder "sonstige" (erkenne aus Beleg ob Kartenzahlung, Barzahlung, etc.),
  "category": "travel" oder "meals" oder "office" oder "transport" oder "telecom" oder "software" oder "other" (beste Kategorie fuer diese Ausgabe)
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

    // Calculate API cost (approximate: input + output tokens)
    const inputTokens = result.usage?.input_tokens || 0;
    const outputTokens = result.usage?.output_tokens || 0;
    // Sonnet pricing: $3/M input, $15/M output
    const costUSD = (inputTokens * 3 + outputTokens * 15) / 1_000_000;
    const costEUR = Math.round(costUSD * 0.92 * 10000) / 10000;

    // Accumulate cost
    const previousCost = Number(item.analysis_cost) || 0;
    const totalCost = Math.round((previousCost + costEUR) * 10000) / 10000;

    // Parse the JSON response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // Update the expense item — only fill empty fields, don't overwrite manual entries
    const updates: Record<string, unknown> = {
      analysis_status: "done",
      analysis_raw: { ...parsed, usage: result.usage, cost_eur: costEUR, total_cost_eur: totalCost },
      analysis_cost: totalCost,
    };
    // Only set fields that are currently empty/null/default
    if (!item.date && parsed.invoice_date) updates.date = parsed.invoice_date;
    if (!item.purpose && parsed.purpose) updates.purpose = parsed.purpose;
    if (!item.issuer && parsed.issuer) updates.issuer = parsed.issuer;
    if (item.amount_gross == null || item.amount_gross === 0) {
      if (parsed.amount_gross != null) updates.amount_gross = parsed.amount_gross;
      if (parsed.amount_net != null) updates.amount_net = parsed.amount_net;
      if (parsed.amount_vat != null) updates.amount_vat = parsed.amount_vat;
    }
    if (item.vat_rate == null || item.vat_rate === 0) {
      if (parsed.vat_rate != null) updates.vat_rate = parsed.vat_rate;
    }
    if (!item.account_debit && parsed.account_debit) updates.account_debit = parsed.account_debit;
    if (!item.account_label && parsed.account_label) updates.account_label = parsed.account_label;
    if (!item.payment_method && parsed.payment_method) updates.payment_method = parsed.payment_method;
    if ((!item.category || item.category === "other") && parsed.category) updates.category = parsed.category;

    await supabase.from("expense_items").update(updates).eq("id", expenseItemId);

    return Response.json({ success: true, data: parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("expense_items").update({
      analysis_status: "error",
      analysis_raw: { error: message },
    }).eq("id", expenseItemId);
    return Response.json({ error: message }, { status: 500 });
  }
}
