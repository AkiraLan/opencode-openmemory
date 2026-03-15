import {
  CONFIG,
  OPENMEMORY_API_KEY,
  OPENMEMORY_API_URL,
  OPENMEMORY_ORG_ID,
  OPENMEMORY_PROJECT_ID,
} from "../config.js";
import { log } from "./logger.js";
import type {
  IMemoryBackendClient,
  MemoryScopeContext,
  MemoryType,
  MemorySector,
  SearchMemoriesResult,
  AddMemoryResult,
  ListMemoriesResult,
  DeleteMemoryResult,
  ProfileResult,
  MemoryItem,
} from "../types/index.js";

const TIMEOUT_MS = 30000;

type MemoryFeedback = "POSITIVE" | "NEGATIVE" | "VERY_NEGATIVE";

interface Mem0MemoryRecord {
  id: string;
  memory: string;
  user_id?: string;
  metadata?: Record<string, unknown>;
  categories?: string[];
  created_at?: string;
  updated_at?: string;
  score?: number;
  similarity?: number;
}

interface Mem0AddResponseItem {
  id?: string;
  memory_id?: string;
  data?: {
    memory?: string;
  };
  memory?: string;
}

interface Mem0AddResponse {
  results?: Mem0AddResponseItem[];
}

function hasAddResultsField(data: unknown): data is Mem0AddResponse {
  return typeof data === "object" && data !== null && "results" in data;
}

interface Mem0ListResponse {
  results?: Mem0MemoryRecord[];
  memories?: Mem0MemoryRecord[];
  items?: Mem0MemoryRecord[];
}

interface Mem0FeedbackResponse {
  id?: string;
  feedback?: string;
  feedback_reason?: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

function extractMemoryRecords(data: unknown): Mem0MemoryRecord[] {
  if (Array.isArray(data)) {
    return data as Mem0MemoryRecord[];
  }

  if (!isRecord(data)) {
    return [];
  }

  const container = data as Mem0ListResponse;
  if (Array.isArray(container.results)) {
    return container.results;
  }
  if (Array.isArray(container.memories)) {
    return container.memories;
  }
  if (Array.isArray(container.items)) {
    return container.items;
  }

  return [];
}

export class Mem0RESTClient implements IMemoryBackendClient {
  private baseUrl: string;
  private apiKey?: string;
  private orgId?: string;
  private projectId?: string;

  constructor() {
    this.baseUrl = OPENMEMORY_API_URL.replace(/\/+$/, "");
    this.apiKey = OPENMEMORY_API_KEY;
    this.orgId = OPENMEMORY_ORG_ID || undefined;
    this.projectId = OPENMEMORY_PROJECT_ID || undefined;
  }

  private async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.apiKey) {
      headers.Authorization = `Token ${this.apiKey}`;
    }

    const response = await withTimeout(
      fetch(`${this.baseUrl}${path}`, { ...options, headers, redirect: "manual" }),
      TIMEOUT_MS
    );

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get("location");
      throw new Error(
        [
          `Unexpected redirect from ${this.baseUrl}${path}`,
          location ? `to ${location}` : undefined,
          "This usually means OPENMEMORY_API_URL points to a non-API host or the upstream is redirecting POST requests.",
        ]
          .filter(Boolean)
          .join(" ")
      );
    }

    return response;
  }

  private withOrgProject<T extends Record<string, unknown>>(body: T): T & {
    org_id?: string;
    project_id?: string;
  } {
    return {
      ...body,
      ...(this.orgId && { org_id: this.orgId }),
      ...(this.projectId && { project_id: this.projectId }),
    };
  }

  private withOrgProjectParams(params: URLSearchParams): URLSearchParams {
    if (this.orgId) {
      params.set("org_id", this.orgId);
    }
    if (this.projectId) {
      params.set("project_id", this.projectId);
    }
    return params;
  }

  private getScopeUserId(scope: MemoryScopeContext): string {
    if (scope.projectId) {
      return `${CONFIG.scopePrefix}:${scope.userId}:${scope.projectId}`;
    }
    return `${CONFIG.scopePrefix}:${scope.userId}`;
  }

  private extractSector(record: Mem0MemoryRecord): MemorySector | undefined {
    const metadataSector = isRecord(record.metadata) ? record.metadata.sector : undefined;
    if (typeof metadataSector === "string") {
      return metadataSector as MemorySector;
    }
    return undefined;
  }

  private toMemoryItem(record: Mem0MemoryRecord): MemoryItem {
    const metadata = isRecord(record.metadata) ? record.metadata : undefined;
    const metadataTags = metadata?.tags;
    const tags = Array.isArray(metadataTags)
      ? metadataTags.filter((tag): tag is string => typeof tag === "string")
      : record.categories;

    return {
      id: record.id,
      content: record.memory,
      score: record.score ?? record.similarity,
      salience: record.similarity,
      sector: this.extractSector(record),
      tags,
      metadata,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }

  private filterBySector(memories: MemoryItem[], sector?: MemorySector): MemoryItem[] {
    if (!sector) return memories;
    return memories.filter((memory) => memory.sector === sector);
  }

  async searchMemories(
    query: string,
    scope: MemoryScopeContext,
    options?: { limit?: number; minSalience?: number; sector?: MemorySector }
  ): Promise<SearchMemoriesResult> {
    log("Mem0.searchMemories", { query: query.slice(0, 50), scope });

    try {
      const response = await this.fetch("/v2/memories/search", {
        method: "POST",
        body: JSON.stringify(
          this.withOrgProject({
            query,
            top_k: options?.limit ?? CONFIG.maxMemories,
            threshold: options?.minSalience ?? CONFIG.minSalience,
            filters: {
              user_id: this.getScopeUserId(scope),
            },
          })
        ),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, results: [], total: 0, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = extractMemoryRecords(await response.json());
      const memories = this.filterBySector(
        data.map((record) => this.toMemoryItem(record)),
        options?.sector
      );

      return { success: true, results: memories, total: memories.length };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("Mem0.searchMemories: error", { error: errorMessage });
      return { success: false, results: [], total: 0, error: errorMessage };
    }
  }

  async addMemory(
    content: string,
    scope: MemoryScopeContext,
    options?: { type?: MemoryType; tags?: string[]; metadata?: Record<string, unknown> }
  ): Promise<AddMemoryResult> {
    log("Mem0.addMemory", { contentLength: content.length, scope });

    try {
      const response = await this.fetch("/v1/memories", {
        method: "POST",
        body: JSON.stringify(
          this.withOrgProject({
            user_id: this.getScopeUserId(scope),
            messages: [
              {
                role: "user",
                content,
              },
            ],
            metadata: {
              ...options?.metadata,
              type: options?.type,
              tags: options?.tags,
              sector: options?.tags?.[0],
              scope: scope.projectId ? "project" : "user",
              project_id: scope.projectId,
              source: "opencode-openmemory",
            },
          })
        ),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json() as
        | Mem0AddResponse
        | Mem0AddResponseItem
        | Mem0AddResponseItem[];
      let items: Mem0AddResponseItem[];
      if (Array.isArray(data)) {
        items = data;
      } else if (hasAddResultsField(data) && Array.isArray(data.results)) {
        items = data.results;
      } else {
        items = [data as Mem0AddResponseItem];
      }
      const firstItem = items[0];
      const id = firstItem?.id ?? firstItem?.memory_id;

      return {
        success: true,
        id,
        sector: options?.tags?.[0] as MemorySector | undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("Mem0.addMemory: error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  async listMemories(
    scope: MemoryScopeContext,
    options?: { limit?: number; offset?: number; sector?: MemorySector }
  ): Promise<ListMemoriesResult> {
    log("Mem0.listMemories", { scope, limit: options?.limit });

    try {
      const pageSize = options?.limit ?? CONFIG.maxProjectMemories;
      const page = options?.offset ? Math.floor(options.offset / pageSize) + 1 : 1;

      const response = await this.fetch("/v2/memories", {
        method: "POST",
        body: JSON.stringify(
          this.withOrgProject({
            filters: {
              user_id: this.getScopeUserId(scope),
            },
            page,
            page_size: pageSize,
          })
        ),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, memories: [], error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = extractMemoryRecords(await response.json());
      const memories = this.filterBySector(
        data.map((record) => this.toMemoryItem(record)),
        options?.sector
      );

      return { success: true, memories, total: memories.length };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("Mem0.listMemories: error", { error: errorMessage });
      return { success: false, memories: [], error: errorMessage };
    }
  }

  async deleteMemory(memoryId: string, scope: MemoryScopeContext): Promise<DeleteMemoryResult> {
    log("Mem0.deleteMemory", { memoryId });

    try {
      const params = this.withOrgProjectParams(
        new URLSearchParams({ user_id: this.getScopeUserId(scope) })
      );
      const response = await this.fetch(
        `/v1/memories/${encodeURIComponent(memoryId)}?${params.toString()}`,
        {
        method: "DELETE",
        }
      );

      if (!response.ok && response.status !== 204) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("Mem0.deleteMemory: error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  async createFeedback(
    memoryId: string,
    feedback: MemoryFeedback = "POSITIVE",
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    log("Mem0.createFeedback", { memoryId, feedback });

    try {
      const response = await this.fetch("/v1/feedback", {
        method: "POST",
        body: JSON.stringify(
          this.withOrgProject({
            memory_id: memoryId,
            feedback,
            ...(reason && { feedback_reason: reason }),
          })
        ),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json() as Mem0FeedbackResponse;
      log("Mem0.createFeedback: success", { feedbackId: data.id });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("Mem0.createFeedback: error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  async getProfile(scope: MemoryScopeContext, query?: string): Promise<ProfileResult> {
    log("Mem0.getProfile", { scope });

    try {
      const userScope = { userId: scope.userId };
      const result = await this.searchMemories(
        query || "preferences style workflow",
        userScope,
        { limit: CONFIG.maxProfileItems * 2 }
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const now = Date.now();
      const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

      const staticFacts = result.results
        .filter((memory) => memory.createdAt && new Date(memory.createdAt).getTime() < oneWeekAgo)
        .slice(0, CONFIG.maxProfileItems)
        .map((memory) => memory.content);

      const dynamicFacts = result.results
        .filter((memory) => !memory.createdAt || new Date(memory.createdAt).getTime() >= oneWeekAgo)
        .slice(0, CONFIG.maxProfileItems)
        .map((memory) => memory.content);

      return { success: true, profile: { static: staticFacts, dynamic: dynamicFacts } };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("Mem0.getProfile: error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }
}

let clientInstance: Mem0RESTClient | null = null;

export function getMemoryClient(): Mem0RESTClient {
  if (!clientInstance) {
    clientInstance = new Mem0RESTClient();
  }
  return clientInstance;
}

export const openMemoryClient = {
  get client(): Mem0RESTClient {
    return getMemoryClient();
  },

  searchMemories: (query: string, scope: MemoryScopeContext, options?: { limit?: number; minSalience?: number; sector?: MemorySector }) =>
    getMemoryClient().searchMemories(query, scope, options),

  addMemory: (content: string, scope: MemoryScopeContext, options?: { type?: MemoryType; tags?: string[]; metadata?: Record<string, unknown> }) =>
    getMemoryClient().addMemory(content, scope, options),

  listMemories: (scope: MemoryScopeContext, options?: { limit?: number; offset?: number; sector?: MemorySector }) =>
    getMemoryClient().listMemories(scope, options),

  deleteMemory: (memoryId: string, scope: MemoryScopeContext) =>
    getMemoryClient().deleteMemory(memoryId, scope),

  getProfile: (scope: MemoryScopeContext, query?: string) =>
    getMemoryClient().getProfile(scope, query),

  createFeedback: (memoryId: string, feedback?: MemoryFeedback, reason?: string) =>
    getMemoryClient().createFeedback(memoryId, feedback, reason),
};
