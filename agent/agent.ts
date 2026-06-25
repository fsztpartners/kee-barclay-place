import { defineAgent } from "eve";
import { anthropic } from "@ai-sdk/anthropic";

// Barclay Place — a B2B lead sourcing + qualification agent.
//
// eve allows exactly ONE root agent per project (agent/agent.ts). This is it:
// a single agent with one tool (`score_lead`) that computes a deterministic ICP
// fit score for a lead. It sources net-new accounts and qualifies them, leaning
// on the required Apollo connection (enrich + email-find) and the tenant's ICP
// knowledge base — see entry.json for the declared dependencies.
//
// Model routing mirrors the platform convention: the Vercel AI Gateway string in
// production (needs AI_GATEWAY_API_KEY), the direct Anthropic provider in local
// dev. The model decides when to call `score_lead` and relays the result, so it's
// the cheap tier.
export default defineAgent({
  model: process.env.AI_GATEWAY_API_KEY
    ? "anthropic/claude-haiku-4.5"
    : anthropic("claude-haiku-4-5-20251001"),
});
