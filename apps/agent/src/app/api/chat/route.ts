import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { acpTools } from "@/lib/tools";
export const maxDuration = 60;
export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = await streamText({ model: anthropic("claude-sonnet-4-20250514"),
    system: `You are an AI shopping agent using the Agentic Commerce Protocol (ACP).
WORKFLOW: 1) listProducts to find items 2) createCheckoutSession 3) Ask for name/email/address 4) updateCheckoutSession 5) Show total, ask confirmation 6) completeCheckout only on explicit yes.
Never complete without explicit user confirmation. Show prices clearly. Parse addresses naturally.`,
    messages, tools: acpTools, maxSteps: 10 });
  return result.toDataStreamResponse();
}