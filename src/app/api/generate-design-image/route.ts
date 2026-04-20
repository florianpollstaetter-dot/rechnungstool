import { requireCompanyMembership } from "@/lib/api-auth";

const REPLICATE_MODEL = process.env.REPLICATE_IMAGE_MODEL || "black-forest-labs/flux-1.1-pro";

type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
};

async function runReplicate(prompt: string, token: string): Promise<string[]> {
  const res = await fetch(`https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({
      input: {
        prompt: `Professional business/corporate image: ${prompt}. High quality, suitable for a business proposal document.`,
        aspect_ratio: "1:1",
        output_format: "png",
        safety_tolerance: 2,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Replicate API error: ${res.status} ${detail}`);
  }

  let prediction = (await res.json()) as ReplicatePrediction;

  while (prediction.status === "starting" || prediction.status === "processing") {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!poll.ok) {
      throw new Error(`Replicate poll error: ${poll.status} ${await poll.text()}`);
    }
    prediction = (await poll.json()) as ReplicatePrediction;
  }

  if (prediction.status !== "succeeded") {
    throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error || "unknown error"}`);
  }

  const output = prediction.output;
  if (!output) return [];
  return Array.isArray(output) ? output : [output];
}

export async function POST(request: Request) {
  const { prompt, count = 1, companyId } = await request.json();

  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt required" }, { status: 400 });
  }

  const auth = await requireCompanyMembership(companyId);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return Response.json(
      { error: "AI image generation not configured. Set REPLICATE_API_TOKEN." },
      { status: 503 }
    );
  }

  const imageCount = Math.min(Math.max(1, Number(count) || 1), 5);

  try {
    const supabase = auth.service;
    const activeCompanyId = companyId as string;
    const savedImages: { id: string; url: string }[] = [];

    for (let i = 0; i < imageCount; i++) {
      const urls = await runReplicate(prompt, token);
      if (urls.length === 0) continue;

      const imageUrl = urls[0];
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        console.error(`Failed to download Replicate image: ${imgRes.status}`);
        continue;
      }
      const buffer = Buffer.from(await imgRes.arrayBuffer());

      const fileName = `ai-${Date.now()}-${i}.png`;
      const storagePath = `${activeCompanyId}/ai-${crypto.randomUUID()}.png`;

      const { error: uploadError } = await supabase.storage
        .from("design-photos")
        .upload(storagePath, buffer, { contentType: "image/png" });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        continue;
      }

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

    if (savedImages.length === 0) {
      return Response.json(
        { error: "Image generation produced no images" },
        { status: 502 }
      );
    }

    return Response.json({ images: savedImages });
  } catch (err) {
    console.error("Image generation error:", err);
    const message = err instanceof Error ? err.message : "Image generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
