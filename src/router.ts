import type { BindingConfig, ResolvedConfig } from "./types.js";

export function normalizeGuildId(guildId: string | null): string {
  return guildId ?? "dm";
}

export function bindingKey(guildId: string, channelId: string): string {
  return `${guildId}:${channelId}`;
}

export function buildSessionKey(guildId: string, channelId: string): string {
  return `discord:${guildId}:${channelId}`;
}

export function resolveBinding(params: {
  config: ResolvedConfig;
  guildId: string;
  channelId: string;
}): BindingConfig | undefined {
  return params.config.bindingsByKey.get(bindingKey(params.guildId, params.channelId));
}
