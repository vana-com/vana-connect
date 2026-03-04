export const config = {
  privateKey: (process.env.VANA_PRIVATE_KEY ??
    process.env.VANA_APP_PRIVATE_KEY) as `0x${string}`,
  appUrl: process.env.APP_URL ?? "",
  environment: "dev" as const,
  llm: {
    apiUrl:
      process.env.LLM_API_URL ?? "https://api.openai.com/v1/chat/completions",
    apiKey: process.env.LLM_API_KEY ?? "",
    model: process.env.LLM_MODEL ?? "gpt-4o",
  },
};
