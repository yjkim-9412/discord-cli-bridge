import crypto from "node:crypto";
import path from "node:path";
import type { ApprovalRequest, ApprovalStatus, ProviderId, ReasoningEffort } from "../types.js";
import { JsonFileStore } from "./json-file-store.js";

export class ApprovalStore {
  private readonly store: JsonFileStore<Record<string, ApprovalRequest>>;
  private cache: Record<string, ApprovalRequest> | null = null;

  constructor(stateDir: string) {
    this.store = new JsonFileStore<Record<string, ApprovalRequest>>(
      path.join(stateDir, "approvals.json"),
      {},
    );
  }

  private async ensureLoaded(): Promise<Record<string, ApprovalRequest>> {
    if (!this.cache) {
      this.cache = await this.store.load();
    }
    return this.cache;
  }

  async create(params: {
    sessionKey: string;
    requestedBy: string;
    provider: ProviderId;
    model: string;
    reasoningEffort?: ReasoningEffort;
    workspacePath: string;
    prompt: string;
    ttlMs: number;
  }): Promise<ApprovalRequest> {
    const all = await this.ensureLoaded();
    const now = Date.now();
    const approvalId = crypto.randomBytes(4).toString("hex");

    const entry: ApprovalRequest = {
      approvalId,
      sessionKey: params.sessionKey,
      requestedBy: params.requestedBy,
      provider: params.provider,
      model: params.model,
      reasoningEffort: params.reasoningEffort,
      workspacePath: params.workspacePath,
      prompt: params.prompt,
      createdAt: now,
      expiresAt: now + params.ttlMs,
      status: "pending",
    };

    all[approvalId] = entry;
    await this.store.save(all);
    return entry;
  }

  async get(approvalId: string): Promise<ApprovalRequest | undefined> {
    const all = await this.ensureLoaded();
    return all[approvalId];
  }

  async setStatus(approvalId: string, status: ApprovalStatus): Promise<ApprovalRequest> {
    const all = await this.ensureLoaded();
    const entry = all[approvalId];
    if (!entry) {
      throw new Error(`Unknown approval id: ${approvalId}`);
    }

    entry.status = status;
    await this.store.save(all);
    return entry;
  }

  async pendingCountForSession(sessionKey: string): Promise<number> {
    const all = await this.ensureLoaded();
    return Object.values(all).filter((entry) => entry.sessionKey === sessionKey && entry.status === "pending")
      .length;
  }

  async expirePending(now = Date.now()): Promise<number> {
    const all = await this.ensureLoaded();
    let count = 0;

    for (const entry of Object.values(all)) {
      if (entry.status === "pending" && entry.expiresAt <= now) {
        entry.status = "expired";
        count += 1;
      }
    }

    if (count > 0) {
      await this.store.save(all);
    }

    return count;
  }
}
