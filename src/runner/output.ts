import type { ProviderId } from "../types.js";

function maybeParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseJsonl(stdout: string): unknown[] {
  const out: unknown[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parsed = maybeParseJson(trimmed);
    if (parsed != null) {
      out.push(parsed);
    }
  }
  return out;
}

function collectPlainText(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPlainText(item));
  }
  return [];
}

function extractPreferredText(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const record = value as Record<string, unknown>;

  // Codex JSONL: only surface final assistant text, not internal reasoning/meta strings.
  if (record.type === "item.completed") {
    const item = record.item;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const itemRecord = item as Record<string, unknown>;
      if (itemRecord.type === "agent_message") {
        return collectPlainText(itemRecord.text);
      }
    }
  }

  if (typeof record.output_text === "string") {
    return collectPlainText(record.output_text);
  }

  if (typeof record.message === "string") {
    return collectPlainText(record.message);
  }

  if (typeof record.result === "string") {
    return collectPlainText(record.result);
  }

  if (typeof record.response === "string") {
    return collectPlainText(record.response);
  }

  if (record.type === "assistant" || record.role === "assistant") {
    return collectPlainText(record.text ?? record.content);
  }

  return [];
}

function extractNonJsonLines(stdout: string): string {
  const lines: string[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (maybeParseJson(line) != null) {
      continue;
    }
    lines.push(line);
  }
  return lines.join("\n").trim();
}

function extractSessionId(value: unknown, provider: ProviderId): string | undefined {
  const targetKeys =
    provider === "codex"
      ? ["thread_id", "threadId"]
      : ["session_id", "sessionId", "conversation_id", "conversationId"];

  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }

    const record = current as Record<string, unknown>;
    for (const key of targetKeys) {
      const raw = record[key];
      if (typeof raw === "string" && raw.trim()) {
        return raw.trim();
      }
    }

    for (const nested of Object.values(record)) {
      if (nested && typeof nested === "object") {
        stack.push(nested);
      }
    }
  }

  return undefined;
}

function extractUsage(value: unknown, provider: ProviderId): {
  inputTokens: number;
  outputTokens: number;
} | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (provider === "codex" && record.type === "turn.completed") {
    const usage = record.usage;
    if (usage && typeof usage === "object" && !Array.isArray(usage)) {
      const usageRecord = usage as Record<string, unknown>;
      const inputRaw = usageRecord.input_tokens;
      const outputRaw = usageRecord.output_tokens;
      if (typeof inputRaw === "number" && typeof outputRaw === "number") {
        return {
          inputTokens: inputRaw,
          outputTokens: outputRaw,
        };
      }
    }
  }

  return undefined;
}

export function parseCliOutput(params: {
  provider: ProviderId;
  stdout: string;
  stderr: string;
}): { text: string; sessionId?: string; inputTokens?: number; outputTokens?: number } {
  const stdout = params.stdout.trim();
  const stderr = params.stderr.trim();

  const parsedObjects: unknown[] = [];
  const parsedJson = maybeParseJson(stdout);
  if (parsedJson != null) {
    parsedObjects.push(parsedJson);
  }

  const parsedJsonl = parseJsonl(stdout);
  if (parsedJsonl.length > 0) {
    parsedObjects.push(...parsedJsonl);
  }

  const preferredText = parsedObjects.flatMap((value) => extractPreferredText(value));
  const textFromJson = preferredText.join("\n\n").trim();
  const textFromPlainLines = extractNonJsonLines(stdout);
  const text = textFromJson || textFromPlainLines || stderr || "Command succeeded but produced no output.";

  let sessionId: string | undefined;
  let usage:
    | {
        inputTokens: number;
        outputTokens: number;
      }
    | undefined;
  for (const value of parsedObjects) {
    const found = extractSessionId(value, params.provider);
    if (found) {
      sessionId = found;
    }
    if (!usage) {
      usage = extractUsage(value, params.provider);
    }
  }

  return {
    text,
    sessionId,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
  };
}
