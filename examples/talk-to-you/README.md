# Talk to You

Chat with an AI version of yourself, built from your own ChatGPT conversations. Connect your data via Vana, ask a question, and get a personalized answer powered by AI.

Each question triggers a fresh Vana Connect flow — the user approves data access, data is fetched, and the LLM answers based on the conversation history.

## Prerequisites

- A builder address registered on-chain via the Vana Gateway
- A running Personal Server with `VANA_MASTER_KEY_SIGNATURE` set
- An API key for an **OpenAI-compatible** LLM provider (see below)

## Setup

```bash
cp .env.local.example .env.local
# Edit .env.local with your keys (see below)
pnpm install
pnpm dev   # Opens on http://localhost:3002
```

## Environment Variables

| Variable           | Required | Description                                                     |
| ------------------ | -------- | --------------------------------------------------------------- |
| `VANA_PRIVATE_KEY` | Yes      | Builder private key registered on-chain                         |
| `APP_URL`          | Yes      | Public URL of your deployed app                                 |
| `LLM_API_URL`      | Yes      | Chat completions endpoint (OpenAI-compatible)                   |
| `LLM_API_KEY`      | Yes      | API key for the LLM provider                                    |
| `LLM_MODEL`        | Yes      | Model identifier (e.g. `gpt-4.1`, `claude-sonnet-4-5-20250929`) |

### LLM Provider Examples

**OpenAI**

```env
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4.1
```

**Anthropic (via OpenAI-compatible proxy)**

```env
LLM_API_URL=https://api.anthropic.com/v1/messages
LLM_API_KEY=sk-ant-...
LLM_MODEL=claude-sonnet-4-5-20250929
```

**Ollama (local)**

```env
LLM_API_URL=http://localhost:11434/v1/chat/completions
LLM_API_KEY=ollama
LLM_MODEL=llama3
```

> The analyze endpoint uses the standard OpenAI chat completions format (`messages`, `model`, `temperature`). Any provider that accepts this format will work.

## How It Works

1. **Ask** — Type a question about yourself (e.g. "What are my main interests?")
2. **Connect** — A Vana Connect session is created and you approve data sharing in the dataConnect Desktop App
3. **Fetch** — Your ChatGPT conversation data is fetched from your Personal Server
4. **Answer** — The data + your question are sent to the configured LLM and the answer is displayed

Each question goes through the full connect flow. All LLM API keys stay server-side.

## Customization

- **Scopes**: Edit the `SCOPES` array in `src/config.ts` to request different data types
- **Prompt**: Modify the `SYSTEM_PROMPT` in `src/app/api/analyze/route.ts` to change the answer style
- **Suggestions**: Edit the `SUGGESTIONS` array in `src/components/ConnectFlow.tsx`
