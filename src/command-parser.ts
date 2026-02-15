import type { ProviderId, ReasoningEffort } from "./types.js";

export type ParsedCommand = {
  name: string;
  args: string;
};

export function parseCommandText(content: string): ParsedCommand | null {
  const trimmed = content.trim();
  if (trimmed.length < 2) {
    return null;
  }

  const prefix = trimmed[0];
  if (prefix !== "/" && prefix !== "!") {
    return null;
  }

  const body = trimmed.slice(1).trim();
  if (!body) {
    return null;
  }

  const firstSpace = body.indexOf(" ");
  if (firstSpace < 0) {
    return {
      name: body.toLowerCase(),
      args: "",
    };
  }

  return {
    name: body.slice(0, firstSpace).toLowerCase(),
    args: body.slice(firstSpace + 1).trim(),
  };
}

export function parseRunArgs(raw: string): {
  providerOverride?: ProviderId;
  prompt: string;
  error?: string;
} {
  let rest = raw.trim();
  let providerOverride: ProviderId | undefined;

  if (rest.startsWith("--provider=")) {
    const value = rest.slice("--provider=".length).split(/\s+/, 1)[0]?.trim().toLowerCase();
    if (value !== "codex" && value !== "claude") {
      return { prompt: "", error: `Invalid provider: ${value || "(empty)"}` };
    }
    providerOverride = value;
    rest = rest.slice("--provider=".length + value.length).trim();
  } else if (rest.startsWith("--provider ")) {
    const parts = rest.split(/\s+/);
    const value = parts[1]?.trim().toLowerCase();
    if (value !== "codex" && value !== "claude") {
      return { prompt: "", error: `Invalid provider: ${value || "(empty)"}` };
    }
    providerOverride = value;
    rest = parts.slice(2).join(" ").trim();
  }

  if (!rest) {
    return {
      providerOverride,
      prompt: "",
      error: "Missing prompt.",
    };
  }

  return {
    providerOverride,
    prompt: rest,
  };
}

function normalizeReasoningEffort(raw: string): ReasoningEffort | undefined {
  const normalized = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized === "low") {
    return "low";
  }
  if (normalized === "medium" || normalized === "med") {
    return "medium";
  }
  if (normalized === "high") {
    return "high";
  }
  if (normalized === "xhigh" || normalized === "extrahigh" || normalized === "extra" || normalized === "xh") {
    return "xhigh";
  }
  return undefined;
}

export function parseModelArgs(raw: string): {
  model: string;
  reasoningEffort?: ReasoningEffort;
  error?: string;
} {
  let rest = raw.trim();
  let reasoningEffort: ReasoningEffort | undefined;

  if (!rest) {
    return { model: "", error: "Missing model." };
  }

  const inlineMatch = rest.match(/\s+--reasoning=([^\s]+)\s*$/);
  if (inlineMatch?.[1]) {
    const parsed = normalizeReasoningEffort(inlineMatch[1]);
    if (!parsed) {
      return { model: "", error: `Invalid reasoning level: ${inlineMatch[1]}` };
    }
    reasoningEffort = parsed;
    rest = rest.slice(0, inlineMatch.index).trim();
  } else {
    const splitMatch = rest.match(/\s+--reasoning\s+([^\s]+)\s*$/);
    if (splitMatch?.[1]) {
      const parsed = normalizeReasoningEffort(splitMatch[1]);
      if (!parsed) {
        return { model: "", error: `Invalid reasoning level: ${splitMatch[1]}` };
      }
      reasoningEffort = parsed;
      rest = rest.slice(0, splitMatch.index).trim();
    } else {
      const parts = rest.split(/\s+/);
      if (parts.length >= 2) {
        const parsed = normalizeReasoningEffort(parts[parts.length - 1] ?? "");
        if (parsed) {
          reasoningEffort = parsed;
          rest = parts.slice(0, -1).join(" ").trim();
        }
      }
    }
  }

  if (!rest) {
    return { model: "", error: "Missing model." };
  }

  return {
    model: rest,
    reasoningEffort,
  };
}
