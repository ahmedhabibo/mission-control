import { NextResponse } from "next/server";
import { discoverModels } from "@/lib/chat/dynamic-models";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/models — returns models discovered from Hermes config.yaml.
 *
 * Returns both a flat list and a grouped format (by provider) so the
 * ModelPicker can render with section headers.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");

  let models = discoverModels();

  // Filter by agent if requested
  if (agentId) {
    switch (agentId) {
      case "nim":
      case "hermes":
        models = models.filter((m) => m.provider === "nvidia");
        break;
      case "mistral-direct":
        models = models.filter((m) => m.provider === "mistral");
        break;
    }
  }

  // Build grouped format for ModelPicker
  const providerLabels: Record<string, string> = {
    nvidia: "NVIDIA NIM",
    mistral: "Mistral",
    openrouter: "OpenRouter",
    openai: "OpenAI",
    anthropic: "Anthropic",
  };

  const providers = [...new Set(models.map((m) => m.provider))];
  const groups = providers.map((provider) => ({
    provider,
    label: providerLabels[provider] ?? provider,
    models: models
      .filter((m) => m.provider === provider)
      .map((m) => ({
        id: m.id,
        friendlyName: m.friendlyName,
        isDefault: m.isDefault ?? false,
      })),
  }));

  return NextResponse.json({
    models, // flat list
    groups, // grouped for ModelPicker
    meta: {
      count: models.length,
      defaultModel: models.find((m) => m.isDefault)?.id ?? null,
    },
  });
}
