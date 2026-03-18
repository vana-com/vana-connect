# Research Plan: Personal Data as Agent Context

## Core question

Can a user's personal data (from connected platforms like GitHub,
ChatGPT, LinkedIn, Spotify) reduce the need for human-in-the-loop
intervention in autonomous coding agents, enabling longer autonomous
operation or auto-initiated task sequences?

## Sub-questions

### 1. Current state of autonomous agent duration and reliability

**What to find:** Published benchmarks on how long coding agents
(Claude Code, Codex, Devin, Cursor, Windsurf) operate autonomously
before requiring human intervention. Anthropic's data on task
duration scaling with model capability. SWE-bench scores, GAIA
benchmarks, real-world deployment data.
**Why it matters:** Establishes the baseline. If agents already
operate for hours without intervention, the marginal value of
personal data context is different than if they stall after minutes.
**Good looks like:** Specific numbers on autonomous task duration,
success rates, intervention frequency.

### 2. What "human in the loop" actually provides

**What to find:** Taxonomy of human interventions in agent workflows.
Research or practitioner reports breaking down WHY humans intervene:
intent clarification, context provision, error correction, approval
gates, preference expression, priority setting.
**Why it matters:** If personal data can only substitute for 1 of 6
intervention types, the value proposition is narrow. If it covers 4
of 6, the proposition is transformative.
**Good looks like:** Categorized breakdown with relative frequency
data.

### 3. Which interventions personal data can substitute for

**What to find:** Existing research or products that use personal
data, preference models, or user history to reduce human
intervention in automated workflows. Not limited to coding: include
email triage, calendar management, recommendation systems, personal
AI assistants.
**Why it matters:** Maps the hypothesis to evidence.
**Good looks like:** Concrete examples where user data replaced
a human decision point.

### 4. Existing products at the intersection

**What to find:** Products that combine personal data aggregation
with AI agent autonomy. Memory systems (ChatGPT memory, Mem.ai,
Rewind/Limitless), personal AI assistants (Rabbit R1, Humane AI
Pin, Personal.ai), preference learning systems, context-aware
agents. Include failed products.
**Why it matters:** Shows what's been tried, what worked, what
didn't.
**Good looks like:** Product names, funding, user counts, status,
specific capabilities.

### 5. Competitive landscape for reducing human-in-the-loop

**What to find:** Tools, frameworks, and approaches specifically
aimed at reducing human intervention in coding agents. MCP servers,
context providers, memory systems, codebase indexing, task
planners. Companies building "agent infrastructure."
**Why it matters:** Maps where Vana Connect would sit competitively.
**Good looks like:** Named companies, approaches, funding,
differentiation.

### 6. Potential product shapes

**What to find:** Existing implementations or proposals for
generating agent prompts or tasks from personal data. "Daily
briefing" products, automated task queues, intent inference
systems. Academic research on user modeling for task prediction.
**Why it matters:** Informs what a "vana connect" feature that
generates agent prompts from personal data could look like.
**Good looks like:** Concrete product descriptions, research
papers, user behavior data.

### 7. The graveyard

**What to find:** Products and companies that tried to be a
"personal AI" or "data-driven autonomous assistant" and failed.
Why they failed: data quality, user trust, cold start, wrong
abstraction level.
**Why it matters:** Failure modes are the most valuable data.
**Good looks like:** Named failures with specific reasons.

## Proposed report sections

1. Terminology and definitions
2. Autonomous agent capabilities (current state)
3. Anatomy of human-in-the-loop interventions
4. Personal data as context: what it can and cannot substitute
5. Existing products and approaches
6. Competitive landscape
7. Product shape analysis
8. The graveyard: failures and lessons
9. Sources

## Parallelization

Wave 1 (parallel): Sub-questions 1, 2, 4, 5, 7
Wave 2 (after wave 1 merge): Sub-questions 3, 6 (depend on
findings from wave 1)
