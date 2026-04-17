import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  const { prompt, count = 1, companyId } = await request.json();

  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt required" }, { status: 400 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return Response.json(
      { error: "AI image generation not configured. Set OPENAI_API_KEY in environment." },
      { status: 503 }
    );
  }

  const imageCount = Math.min(Math.max(1, Number(count) || 1), 4);

  try {
    // Call OpenAI DALL-E 3
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `Professional business/corporate image: ${prompt}. High quality, suitable for a business proposal document.`,
        n: imageCount,
        size: "1024x1024",
        quality: "standard",
        response_format: "b64_json",
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return Response.json(
        { error: err.error?.message || `OpenAI API error: ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const supabase = createClient(supabaseUrl, supabaseKey);
    const activeCompanyId = companyId || "vrthefans";
    const savedImages: { id: string; url: string }[] = [];

    for (let i = 0; i < data.data.length; i++) {
      const imageData = data.data[i];
      const base64 = imageData.b64_json;
      const buffer = Buffer.from(base64, "base64");
      const fileName = `ai-${Date.now()}-${i}.png`;
      const storagePath = `${activeCompanyId}/ai-${crypto.randomUUID()}.png`;

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from("design-photos")
        .upload(storagePath, buffer, { contentType: "image/png" });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        continue;
      }

      // Save to database
      const { data: photoRow, error: dbError } = await supabase
        .from("quote_design_photos")
        .insert({
          company_id: activeCompanyId,
          file_path: storagePath,
          file_name: fileName,
          file_type: "image/png",
          file_size: buffer.length,
          ai_generated: true,
          ai_prompt: prompt,
        })
        .select()
        .single();

      if (dbError) {
        console.error("DB error:", dbError);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("design-photos")
        .getPublicUrl(storagePath);

      savedImages.push({ id: photoRow.id, url: urlData.publicUrl });
    }

    return Response.json({ images: savedImages });
  } catch (err) {
    console.error("Image generation error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Image generation failed" },
      { status: 500 }
    );
  }
}
