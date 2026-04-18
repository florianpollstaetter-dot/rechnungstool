import { createClient } from "@supabase/supabase-js";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TITAN_MODEL_ID = process.env.BEDROCK_IMAGE_MODEL_ID || "amazon.titan-image-generator-v1";
const IMAGE_REGION = process.env.BEDROCK_IMAGE_REGION || process.env.AWS_REGION || "us-east-1";

export async function POST(request: Request) {
  const { prompt, count = 1, companyId } = await request.json();

  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt required" }, { status: 400 });
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return Response.json(
      { error: "AI image generation not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY for Bedrock." },
      { status: 503 }
    );
  }

  const imageCount = Math.min(Math.max(1, Number(count) || 1), 5);

  try {
    const bedrock = new BedrockRuntimeClient({
      region: IMAGE_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const body = {
      taskType: "TEXT_IMAGE",
      textToImageParams: {
        text: `Professional business/corporate image: ${prompt}. High quality, suitable for a business proposal document.`,
      },
      imageGenerationConfig: {
        numberOfImages: imageCount,
        height: 1024,
        width: 1024,
        cfgScale: 8.0,
      },
    };

    const response = await bedrock.send(
      new InvokeModelCommand({
        modelId: TITAN_MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(body),
      })
    );

    const decoded = JSON.parse(new TextDecoder().decode(response.body));
    const images: string[] = decoded.images || [];

    if (images.length === 0) {
      return Response.json(
        { error: "Titan returned no images", detail: decoded },
        { status: 502 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const activeCompanyId = companyId || "vrthefans";
    const savedImages: { id: string; url: string }[] = [];

    for (let i = 0; i < images.length; i++) {
      const base64 = images[i];
      const buffer = Buffer.from(base64, "base64");
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

    return Response.json({ images: savedImages });
  } catch (err) {
    console.error("Image generation error:", err);
    const message = err instanceof Error ? err.message : "Image generation failed";
    const isAccessError = message.includes("AccessDenied") || message.includes("not authorized") || message.includes("don't have access");
    return Response.json(
      {
        error: isAccessError
          ? `Bedrock model access denied for ${TITAN_MODEL_ID} in ${IMAGE_REGION}. Enable Titan Image Generator in the Bedrock console or set BEDROCK_IMAGE_REGION to a supported region.`
          : message,
      },
      { status: isAccessError ? 503 : 500 }
    );
  }
}
