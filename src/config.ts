import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { stripJsoncComments } from "./services/jsonc.js";
import type { MemorySector } from "./types/index.js";

const CONFIG_DIR = join(homedir(), ".config", "opencode");
const CONFIG_FILES = [
  join(CONFIG_DIR, "openmemory.jsonc"),
  join(CONFIG_DIR, "openmemory.json"),
];

interface OpenMemoryConfig {
  apiUrl?: string;
  apiKey?: string;
  orgId?: string;
  projectId?: string;
  filterPrompt?: string;
  keywordPatterns?: string[];
  compactionThreshold?: number;
  
  similarityThreshold?: number;
  maxMemories?: number;
  maxProjectMemories?: number;
  maxProfileItems?: number;
  minSalience?: number;
  
  injectProfile?: boolean;
  scopePrefix?: string;
  defaultSector?: string;
}

const VALID_MEMORY_SECTORS: readonly MemorySector[] = [
  "episodic",
  "semantic",
  "procedural",
  "emotional",
  "reflective",
];

const DEFAULTS: Required<Omit<OpenMemoryConfig, "apiKey">> = {
  apiUrl: "https://api.mem0.ai",
  orgId: "",
  projectId: "",
  filterPrompt: "",
  keywordPatterns: [],
  compactionThreshold: 0.8,
  similarityThreshold: 0.6,
  maxMemories: 5,
  maxProjectMemories: 10,
  maxProfileItems: 5,
  minSalience: 0.3,
  injectProfile: true,
  scopePrefix: "opencode",
  defaultSector: "semantic",
};

function loadConfig(): OpenMemoryConfig {
  for (const path of CONFIG_FILES) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, "utf-8");
        const json = stripJsoncComments(content);
        return JSON.parse(json) as OpenMemoryConfig;
      } catch {
        // Invalid config, use defaults
      }
    }
  }
  return {};
}

const fileConfig = loadConfig();

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readUnitInterval(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : fallback;
}

function readPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function readMemorySector(value: unknown, fallback: MemorySector): MemorySector {
  return typeof value === "string" &&
    (VALID_MEMORY_SECTORS as readonly string[]).includes(value)
    ? (value as MemorySector)
    : fallback;
}

const keywordPatterns = Array.isArray(fileConfig.keywordPatterns)
  ? fileConfig.keywordPatterns.filter((pattern): pattern is string => typeof pattern === "string")
  : DEFAULTS.keywordPatterns;

function isPlaceholderApiKey(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim();
  return normalized.length === 0 || normalized === "m0-your-api-key";
}

export const OPENMEMORY_API_KEY = fileConfig.apiKey ?? process.env.OPENMEMORY_API_KEY;
export const OPENMEMORY_API_URL = fileConfig.apiUrl ?? process.env.OPENMEMORY_API_URL ?? DEFAULTS.apiUrl;
export const OPENMEMORY_ORG_ID = fileConfig.orgId ?? process.env.OPENMEMORY_ORG_ID ?? DEFAULTS.orgId;
export const OPENMEMORY_PROJECT_ID = fileConfig.projectId ?? process.env.OPENMEMORY_PROJECT_ID ?? DEFAULTS.projectId;

export const CONFIG = {
  apiUrl: OPENMEMORY_API_URL,
  orgId: OPENMEMORY_ORG_ID,
  projectId: OPENMEMORY_PROJECT_ID,
  filterPrompt: readString(fileConfig.filterPrompt, DEFAULTS.filterPrompt),
  keywordPatterns,
  compactionThreshold: readUnitInterval(fileConfig.compactionThreshold, DEFAULTS.compactionThreshold),
  similarityThreshold: readUnitInterval(fileConfig.similarityThreshold, DEFAULTS.similarityThreshold),
  maxMemories: readPositiveInteger(fileConfig.maxMemories, DEFAULTS.maxMemories),
  maxProjectMemories: readPositiveInteger(fileConfig.maxProjectMemories, DEFAULTS.maxProjectMemories),
  maxProfileItems: readPositiveInteger(fileConfig.maxProfileItems, DEFAULTS.maxProfileItems),
  minSalience: readUnitInterval(fileConfig.minSalience, DEFAULTS.minSalience),
  injectProfile: readBoolean(fileConfig.injectProfile, DEFAULTS.injectProfile),
  scopePrefix: readString(fileConfig.scopePrefix, DEFAULTS.scopePrefix),
  defaultSector: readMemorySector(fileConfig.defaultSector, DEFAULTS.defaultSector),
};

export function isConfigured(): boolean {
  return !isPlaceholderApiKey(OPENMEMORY_API_KEY);
}
