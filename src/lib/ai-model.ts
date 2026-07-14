// Single source of truth for Anthropic model ids. A model retirement (the
// direct API returns 404 not_found for a dropped id) must be a one-line change
// here or an ENV override — never a hunt through every feature that calls Claude.
//
// ANTHROPIC_MODEL  — direct Anthropic API (used when no AWS/Bedrock creds).
// BEDROCK_MODEL    — AWS Bedrock inference profile for EU data residency.

export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

// Bedrock only serves prod when AWS creds are set (currently direct API in prod).
// Override via BEDROCK_MODEL when the EU inference profile is upgraded.
export const BEDROCK_MODEL =
  process.env.BEDROCK_MODEL || "eu.claude-sonnet-4-6-v1:0";
