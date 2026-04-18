import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";

/**
 * Creates the Claude AI client. Uses AWS Bedrock (eu-central-1) when AWS
 * credentials are configured, providing EU data residency. Falls back to
 * direct Anthropic API when only ANTHROPIC_API_KEY is set.
 */
export function createAIClient(): { client: AnthropicBedrock; model: string } | null {
  const awsRegion = process.env.AWS_REGION || "eu-central-1";

  // Prefer Bedrock (EU data residency)
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      client: new AnthropicBedrock({
        awsAccessKey: process.env.AWS_ACCESS_KEY_ID,
        awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
        awsRegion,
      }),
      model: `eu.claude-sonnet-4-20250514-v1:0`,
    };
  }

  // Fallback to direct Anthropic API (for local dev / transition period)
  if (process.env.ANTHROPIC_API_KEY) {
    // AnthropicBedrock doesn't support direct API — use legacy fetch path
    return null;
  }

  return null;
}

/**
 * Calls Claude to analyze an image or PDF document.
 * Handles both Bedrock SDK and direct API fallback.
 */
export async function callClaude(
  contentBlocks: Array<Record<string, unknown>>,
  maxTokens = 1024
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const ai = createAIClient();

  if (ai) {
    // Bedrock SDK path
    const response = await ai.client.messages.create({
      model: ai.model,
      max_tokens: maxTokens,
      messages: [{ role: "user" as const, content: contentBlocks as unknown as Parameters<typeof ai.client.messages.create>[0]["messages"][0]["content"] }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return {
      text: textBlock && "text" in textBlock ? textBlock.text : "{}",
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    };
  }

  // Direct Anthropic API fallback
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    throw new Error("No AI provider configured. Set AWS_ACCESS_KEY_ID+AWS_SECRET_ACCESS_KEY for Bedrock, or ANTHROPIC_API_KEY for direct API.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: contentBlocks }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} ${err}`);
  }

  const result = await response.json();
  const textBlock = result.content?.find((b: Record<string, string>) => b.type === "text");
  return {
    text: textBlock?.text || "{}",
    inputTokens: result.usage?.input_tokens || 0,
    outputTokens: result.usage?.output_tokens || 0,
  };
}

/**
 * Calculate API cost in EUR (approximate).
 * Sonnet pricing: $3/M input, $15/M output
 */
export function calculateCostEUR(inputTokens: number, outputTokens: number): number {
  const costUSD = (inputTokens * 3 + outputTokens * 15) / 1_000_000;
  return Math.round(costUSD * 0.92 * 10000) / 10000;
}

/**
 * Calls Claude with a chat-style message history + optional system prompt.
 * Used by the in-app chatbot (SCH-483).
 */
export async function callClaudeChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  system: string,
  maxTokens = 1024,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const ai = createAIClient();

  if (ai) {
    const response = await ai.client.messages.create({
      model: ai.model,
      max_tokens: maxTokens,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return {
      text: textBlock && "text" in textBlock ? textBlock.text : "",
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    };
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    throw new Error("No AI provider configured. Set AWS_ACCESS_KEY_ID+AWS_SECRET_ACCESS_KEY for Bedrock, or ANTHROPIC_API_KEY for direct API.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} ${err}`);
  }

  const result = await response.json();
  const textBlock = result.content?.find((b: Record<string, string>) => b.type === "text");
  return {
    text: textBlock?.text || "",
    inputTokens: result.usage?.input_tokens || 0,
    outputTokens: result.usage?.output_tokens || 0,
  };
}
