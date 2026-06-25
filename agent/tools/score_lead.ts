import { defineTool } from "eve/tools";
import { z } from "zod";

// The one tool. A pure, deterministic ICP-fit scorer for a B2B lead.
//
// No tenant, no database, no network — the score is computed locally so the agent
// is trivially readable and reproducible. The required Apollo connection (declared
// in entry.json) is what enriches accounts and finds emails at the platform layer;
// Hunter is the optional email fallback. This transform itself does NOT call them —
// it scores whatever lead fields are passed in.
//
// Scoring (0–100): an employee-count band (company size fit) plus weighted credit
// for each demand signal, lightly nudged by industry. Deterministic: same input →
// same score + rationale.

const KNOWN_SIGNALS = [
  "hiring",
  "funding",
  "new_exec",
  "tech_adoption",
  "expansion",
  "intent_keyword",
] as const;

// Each recognised signal contributes this many points (capped below).
const SIGNAL_WEIGHTS: Record<string, number> = {
  funding: 14,
  new_exec: 12,
  hiring: 10,
  expansion: 10,
  intent_keyword: 9,
  tech_adoption: 8,
};

// Industries we consider a strong fit get a small additive nudge.
const STRONG_INDUSTRIES = new Set([
  "software",
  "saas",
  "fintech",
  "technology",
  "information technology",
]);

// Employee-count → band score (sweet spot is mid-market).
function sizeBand(count: number | undefined): { score: number; label: string } {
  if (count === undefined) return { score: 18, label: "unknown size" };
  if (count < 10) return { score: 8, label: "micro (<10)" };
  if (count < 50) return { score: 20, label: "small (10–49)" };
  if (count < 200) return { score: 35, label: "mid-market (50–199)" };
  if (count < 1000) return { score: 40, label: "mid-enterprise (200–999)" };
  if (count < 5000) return { score: 30, label: "enterprise (1k–5k)" };
  return { score: 22, label: "large enterprise (5k+)" };
}

export default defineTool({
  description:
    "Scores a B2B lead for ideal-customer-profile (ICP) fit. Returns a deterministic score 0–100 plus a short rationale. Use this to qualify and rank sourced accounts.",
  inputSchema: z.object({
    company_name: z.string().min(1).max(200).describe("The lead company's name."),
    industry: z
      .string()
      .max(120)
      .optional()
      .describe("Industry / vertical, e.g. 'SaaS', 'fintech'."),
    employee_count: z
      .number()
      .int()
      .nonnegative()
      .max(10_000_000)
      .optional()
      .describe("Approximate number of employees."),
    signals: z
      .array(z.string().max(60))
      .max(20)
      .optional()
      .describe(
        "Demand/buying signals, e.g. 'hiring', 'funding', 'new_exec', 'tech_adoption', 'expansion', 'intent_keyword'.",
      ),
  }),
  execute: async (input) => {
    const reasons: string[] = [];

    // 1. Company-size band (max 40).
    const band = sizeBand(input.employee_count);
    let score = band.score;
    reasons.push(`size: ${band.label} (+${band.score})`);

    // 2. Signals (weighted, capped at 45 combined).
    const signals = (input.signals ?? []).map((s) => s.trim().toLowerCase());
    const recognised = signals.filter((s) => s in SIGNAL_WEIGHTS);
    const unrecognised = signals.filter((s) => !(s in SIGNAL_WEIGHTS));
    let signalScore = 0;
    for (const s of recognised) signalScore += SIGNAL_WEIGHTS[s];
    signalScore = Math.min(signalScore, 45);
    score += signalScore;
    if (recognised.length > 0) {
      reasons.push(`signals: ${recognised.join(", ")} (+${signalScore})`);
    } else {
      reasons.push("signals: none recognised (+0)");
    }
    if (unrecognised.length > 0) {
      reasons.push(`ignored unknown signals: ${unrecognised.join(", ")}`);
    }

    // 3. Industry nudge (max 15).
    const industry = input.industry?.trim().toLowerCase();
    if (industry && STRONG_INDUSTRIES.has(industry)) {
      score += 15;
      reasons.push(`industry: strong-fit '${input.industry}' (+15)`);
    } else if (industry) {
      score += 5;
      reasons.push(`industry: '${input.industry}' (+5)`);
    } else {
      reasons.push("industry: unknown (+0)");
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    const tier =
      score >= 75 ? "hot" : score >= 50 ? "warm" : score >= 25 ? "cool" : "cold";

    const rationale = `${input.company_name}: ${tier} (${score}/100) — ${reasons.join("; ")}.`;

    return {
      company_name: input.company_name,
      score,
      tier,
      known_signals: KNOWN_SIGNALS,
      rationale,
    };
  },
});
