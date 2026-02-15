import path from "node:path";
import type { ProviderId, ReasoningEffort, SessionState } from "../types.js";
import { JsonFileStore } from "./json-file-store.js";

export class SessionStore {
  private readonly store: JsonFileStore<Record<string, SessionState>>;
  private cache: Record<string, SessionState> | null = null;

  constructor(stateDir: string) {
    this.store = new JsonFileStore<Record<string, SessionState>>(
      path.join(stateDir, "sessions.json"),
      {},
    );
  }

  private async ensureLoaded(): Promise<Record<string, SessionState>> {
    if (!this.cache) {
      this.cache = await this.store.load();
    }
    return this.cache;
  }

  async get(sessionKey: string): Promise<SessionState | undefined> {
    const all = await this.ensureLoaded();
    return all[sessionKey];
  }

  async getOrCreate(params: {
    sessionKey: string;
    guildId: string;
    channelId: string;
    projectAlias: string;
    workspacePath: string;
    provider: ProviderId;
    model: string;
    reasoningEffort: ReasoningEffort;
  }): Promise<SessionState> {
    const all = await this.ensureLoaded();
    const existing = all[params.sessionKey];
    if (existing) {
      return existing;
    }

    const created: SessionState = {
      sessionKey: params.sessionKey,
      guildId: params.guildId,
      channelId: params.channelId,
      projectAlias: params.projectAlias,
      workspacePath: params.workspacePath,
      provider: params.provider,
      model: params.model,
      reasoningEffort: params.reasoningEffort,
      cliSessionIds: {},
    };

    all[params.sessionKey] = created;
    await this.store.save(all);
    return created;
  }

  async update(session: SessionState): Promise<void> {
    const all = await this.ensureLoaded();
    all[session.sessionKey] = session;
    await this.store.save(all);
  }

  async setProvider(sessionKey: string, provider: ProviderId): Promise<SessionState> {
    const all = await this.ensureLoaded();
    const current = all[sessionKey];
    if (!current) {
      throw new Error(`Unknown session: ${sessionKey}`);
    }
    current.provider = provider;
    await this.store.save(all);
    return current;
  }

  async setModel(sessionKey: string, model: string): Promise<SessionState> {
    const all = await this.ensureLoaded();
    const current = all[sessionKey];
    if (!current) {
      throw new Error(`Unknown session: ${sessionKey}`);
    }
    current.model = model;
    await this.store.save(all);
    return current;
  }

  async setReasoningEffort(sessionKey: string, reasoningEffort: ReasoningEffort): Promise<SessionState> {
    const all = await this.ensureLoaded();
    const current = all[sessionKey];
    if (!current) {
      throw new Error(`Unknown session: ${sessionKey}`);
    }
    current.reasoningEffort = reasoningEffort;
    await this.store.save(all);
    return current;
  }

  async setRunResult(params: {
    sessionKey: string;
    provider: ProviderId;
    sessionId?: string;
    lastRunAt: number;
  }): Promise<SessionState> {
    const all = await this.ensureLoaded();
    const current = all[params.sessionKey];
    if (!current) {
      throw new Error(`Unknown session: ${params.sessionKey}`);
    }

    current.lastRunAt = params.lastRunAt;
    current.cliSessionIds = current.cliSessionIds ?? {};
    if (params.sessionId) {
      current.cliSessionIds[params.provider] = params.sessionId;
    }

    await this.store.save(all);
    return current;
  }

  async reset(sessionKey: string): Promise<SessionState> {
    const all = await this.ensureLoaded();
    const current = all[sessionKey];
    if (!current) {
      throw new Error(`Unknown session: ${sessionKey}`);
    }

    current.cliSessionIds = {};
    current.lastRunAt = undefined;
    await this.store.save(all);
    return current;
  }

  async resetProviderSession(sessionKey: string, provider: ProviderId): Promise<SessionState> {
    const all = await this.ensureLoaded();
    const current = all[sessionKey];
    if (!current) {
      throw new Error(`Unknown session: ${sessionKey}`);
    }

    current.cliSessionIds = current.cliSessionIds ?? {};
    delete current.cliSessionIds[provider];
    await this.store.save(all);
    return current;
  }
}
