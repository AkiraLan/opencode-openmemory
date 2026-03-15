#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline";
import { parseJsonc } from "./services/jsonc.js";

const OPENCODE_CONFIG_DIR = join(homedir(), ".config", "opencode");
const OH_MY_OPENCODE_CONFIG = join(OPENCODE_CONFIG_DIR, "oh-my-opencode.json");
const CLI_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ENTRY = join(CLI_DIR, "index.js");
const LEGACY_PLUGIN_ENTRIES = [
  "opencode-mem0@latest",
  "@happycastle/opencode-mem0@latest",
];

const MEM0_INIT_COMMAND = `# Initializing Mem0

You are initializing Mem0 persistent memory for this codebase. This is not just data collection - you're building context that will make you significantly more effective across all future sessions.

## Understanding Context

You are a **stateful** coding agent. Users expect to work with you over extended periods - potentially the entire lifecycle of a project. Your memory is how you get better over time and maintain continuity.

## What to Remember

### 1. Procedures (Rules & Workflows)
Explicit rules that should always be followed:
- "Never commit directly to main - always use feature branches"
- "Always run lint before tests"
- "Use conventional commits format"

### 2. Preferences (Style & Conventions)  
Project and user coding style:
- "Prefer functional components over class components"
- "Use early returns instead of nested conditionals"
- "Always add JSDoc to exported functions"

### 3. Architecture & Context
How the codebase works and why:
- "Auth system was refactored in v2.0 - old patterns deprecated"
- "The monorepo used to have 3 modules before consolidation"
- "This pagination bug was fixed before - similar to PR #234"

## Memory Scopes

**Project-scoped** (\`scope: "project"\`):
- Build/test/lint commands
- Architecture and key directories
- Team conventions specific to this codebase
- Technology stack and framework choices
- Known issues and their solutions

**User-scoped** (\`scope: "user"\`):
- Personal coding preferences across all projects
- Communication style preferences
- General workflow habits

## Memory Sectors (OpenMemory HSG)

Mem0 uses a Hierarchical Semantic Graph with 5 sectors:
- **episodic**: Events, experiences, temporal sequences
- **semantic**: Facts, concepts, general knowledge (default)
- **procedural**: Skills, how-to knowledge, processes
- **emotional**: Feelings, sentiments, reactions
- **reflective**: Meta-cognition, insights, patterns

## Research Approach

This is a **deep research** initialization. Take your time and be thorough (~50+ tool calls). The goal is to genuinely understand the project, not just collect surface-level facts.

**What to uncover:**
- Tech stack and dependencies (explicit and implicit)
- Project structure and architecture
- Build/test/deploy commands and workflows
- Contributors & team dynamics (who works on what?)
- Commit conventions and branching strategy
- Code evolution (major refactors, architecture changes)
- Pain points (areas with lots of bug fixes)
- Implicit conventions not documented anywhere

## Research Techniques

### File-based
- README.md, CONTRIBUTING.md, AGENTS.md, CLAUDE.md
- Package manifests (package.json, Cargo.toml, pyproject.toml, go.mod)
- Config files (.eslintrc, tsconfig.json, .prettierrc)
- CI/CD configs (.github/workflows/)

### Git-based
- \`git log --oneline -20\` - Recent history
- \`git branch -a\` - Branching strategy  
- \`git log --format="%s" -50\` - Commit conventions
- \`git shortlog -sn --all | head -10\` - Main contributors

### Explore Agent
Fire parallel explore queries for broad understanding:
\`\`\`
Task(explore, "What is the tech stack and key dependencies?")
Task(explore, "What is the project structure? Key directories?")
Task(explore, "How do you build, test, and run this project?")
Task(explore, "What are the main architectural patterns?")
Task(explore, "What conventions or patterns are used?")
\`\`\`

## How to Do Thorough Research

**Don't just collect data - analyze and cross-reference.**

Bad (shallow):
- Run commands, copy output
- List facts without understanding

Good (thorough):
- Cross-reference findings (if inconsistent, dig deeper)
- Resolve ambiguities (don't leave questions unanswered)
- Read actual file content, not just names
- Look for patterns (what do commits tell you about workflow?)
- Think like a new team member - what would you want to know?

## Saving Memories

Use the \`mem0\` tool for each distinct insight:

\`\`\`
mem0(mode: "add", content: "...", type: "...", scope: "project")
\`\`\`

**Types:**
- \`project-config\` - tech stack, commands, tooling
- \`architecture\` - codebase structure, key components, data flow
- \`learned-pattern\` - conventions specific to this codebase
- \`error-solution\` - known issues and their fixes
- \`preference\` - coding style preferences (use with user scope)

**Guidelines:**
- Save each distinct insight as a separate memory
- Be concise but include enough context to be useful
- Include the "why" not just the "what" when relevant
- Update memories incrementally as you research (don't wait until the end)

**Good memories:**
- "Uses Bun runtime and package manager. Commands: bun install, bun run dev, bun test"
- "API routes in src/routes/, handlers in src/handlers/. Hono framework."
- "Auth uses Redis sessions, not JWT. Implementation in src/lib/auth.ts"
- "Never use \`any\` type - strict TypeScript. Use \`unknown\` and narrow."
- "Database migrations must be backward compatible - we do rolling deploys"

## Upfront Questions

Before diving in, ask:
1. "Any specific rules I should always follow?"
2. "Preferences for how I communicate? (terse/detailed)"

## Reflection Phase

Before finishing, reflect:
1. **Completeness**: Did you cover commands, architecture, conventions, gotchas?
2. **Quality**: Are memories concise and searchable?
3. **Scope**: Did you correctly separate project vs user knowledge?

Then ask: "I've initialized memory with X insights. Want me to continue refining, or is this good?"

## Your Task

1. Ask upfront questions (research depth, rules, preferences)
2. Check existing memories: \`mem0(mode: "list", scope: "project")\`
3. Research based on chosen depth
4. Save memories incrementally as you discover insights
5. Reflect and verify completeness
6. Summarize what was learned and ask if user wants refinement
`;

function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function confirm(rl: readline.Interface, question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${question} (y/n) `, (answer) => {
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

function findOpencodeConfig(): string | null {
  const candidates = [
    join(OPENCODE_CONFIG_DIR, "opencode.jsonc"),
    join(OPENCODE_CONFIG_DIR, "opencode.json"),
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

function addPluginToConfig(configPath: string): boolean {
  try {
    const content = readFileSync(configPath, "utf-8");

    if (content.includes(PLUGIN_ENTRY)) {
      console.log("✓ Plugin already registered in config");
      return true;
    }

    let config: Record<string, unknown>;
    
    try {
      config = parseJsonc<Record<string, unknown>>(content);
    } catch {
      console.error("✗ Failed to parse config file");
      return false;
    }

    const plugins = Array.isArray(config.plugin)
      ? (config.plugin as unknown[]).filter((plugin): plugin is string => typeof plugin === "string")
      : [];
    const hasLegacyEntry = plugins.some((plugin) => LEGACY_PLUGIN_ENTRIES.includes(plugin));
    config.plugin = [
      ...plugins.filter((plugin) => !LEGACY_PLUGIN_ENTRIES.includes(plugin)),
      PLUGIN_ENTRY,
    ];

    if (configPath.endsWith(".jsonc")) {
      if (hasLegacyEntry) {
        let newContent = content;
        for (const legacyEntry of LEGACY_PLUGIN_ENTRIES) {
          newContent = newContent.replaceAll(`"${legacyEntry}"`, `"${PLUGIN_ENTRY}"`);
        }
        writeFileSync(configPath, newContent);
      } else if (content.includes('"plugin"')) {
        const newContent = content.replace(
          /("plugin"\s*:\s*\[)([^\]]*?)(\])/,
          (_match, start, middle, end) => {
            const trimmed = middle.trim();
            if (trimmed === "") {
              return `${start}\n    "${PLUGIN_ENTRY}"\n  ${end}`;
            }
            return `${start}${middle.trimEnd()},\n    "${PLUGIN_ENTRY}"\n  ${end}`;
          }
        );
        writeFileSync(configPath, newContent);
      } else {
        const newContent = content.replace(
          /^(\s*\{)/,
          `$1\n  "plugin": ["${PLUGIN_ENTRY}"],`
        );
        writeFileSync(configPath, newContent);
      }
    } else {
      writeFileSync(configPath, JSON.stringify(config, null, 2));
    }

    console.log(`✓ Registered plugin at ${PLUGIN_ENTRY} in ${configPath}`);
    return true;
  } catch (err) {
    console.error("✗ Failed to update config:", err);
    return false;
  }
}

function createNewConfig(): boolean {
  try {
    const configPath = join(OPENCODE_CONFIG_DIR, "opencode.jsonc");
    mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true });

    const config = `{
  "plugin": ["${PLUGIN_ENTRY}"],
  "command": {
    "mem0-init": {
      "description": "Initialize OpenMemory with comprehensive codebase knowledge",
      "template": ${JSON.stringify(MEM0_INIT_COMMAND)}
    }
  }
}
`;

    writeFileSync(configPath, config);
    console.log(`✓ Created ${configPath}`);
    return true;
  } catch (err) {
    console.error("✗ Failed to create OpenCode config:", err);
    return false;
  }
}

function createCommand(): boolean {
  try {
    const configPath = findOpencodeConfig() ?? join(OPENCODE_CONFIG_DIR, "opencode.jsonc");
    mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true });

    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      config = parseJsonc<Record<string, unknown>>(content);
    }

    const commandConfig = (
      config.command && typeof config.command === "object" && !Array.isArray(config.command)
    ) ? (config.command as Record<string, unknown>) : {};

    commandConfig["mem0-init"] = {
      description: "Initialize Mem0 with comprehensive codebase knowledge",
      template: MEM0_INIT_COMMAND,
    };

    config.command = commandConfig;

    if (!Array.isArray(config.plugin)) {
      config.plugin = [PLUGIN_ENTRY];
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2));

    const legacyCommandPath = join(OPENCODE_CONFIG_DIR, "command", "mem0-init.md");
    if (existsSync(legacyCommandPath)) {
      rmSync(legacyCommandPath);
      console.log("✓ Removed legacy /mem0-init markdown command");
    }

    console.log(`✓ Registered /mem0-init command in ${configPath}`);
    return true;
  } catch (err) {
    console.error("✗ Failed to create /mem0-init command:", err);
    return false;
  }
}

function hasBuiltPlugin(): boolean {
  return existsSync(PLUGIN_ENTRY);
}

function isOhMyOpencodeInstalled(): boolean {
  if (existsSync(OH_MY_OPENCODE_CONFIG)) return true;

  const configPath = findOpencodeConfig();
  if (!configPath) return false;

  try {
    const content = readFileSync(configPath, "utf-8");
    return content.includes("oh-my-opencode");
  } catch {
    return false;
  }
}

function isAutoCompactAlreadyDisabled(): boolean {
  if (!existsSync(OH_MY_OPENCODE_CONFIG)) return false;
  
  try {
    const content = readFileSync(OH_MY_OPENCODE_CONFIG, "utf-8");
    const config = parseJsonc<Record<string, unknown>>(content);
    const disabledHooks = config.disabled_hooks as string[] | undefined;
    return disabledHooks?.includes("anthropic-context-window-limit-recovery") ?? false;
  } catch {
    return false;
  }
}

function disableAutoCompactHook(): boolean {
  try {
    let config: Record<string, unknown> = {};
    
    if (existsSync(OH_MY_OPENCODE_CONFIG)) {
      const content = readFileSync(OH_MY_OPENCODE_CONFIG, "utf-8");
      config = parseJsonc<Record<string, unknown>>(content);
    }
    
    const disabledHooks = (config.disabled_hooks as string[]) || [];
    if (!disabledHooks.includes("anthropic-context-window-limit-recovery")) {
      disabledHooks.push("anthropic-context-window-limit-recovery");
    }
    config.disabled_hooks = disabledHooks;
    
    writeFileSync(OH_MY_OPENCODE_CONFIG, JSON.stringify(config, null, 2));
    console.log(`✓ Disabled anthropic-context-window-limit-recovery hook in oh-my-opencode.json`);
    return true;
  } catch (err) {
    console.error("✗ Failed to update oh-my-opencode.json:", err);
    return false;
  }
}

function createOpenMemoryConfig(): boolean {
  try {
    const configPath = join(OPENCODE_CONFIG_DIR, "mem0.jsonc");

    if (existsSync(configPath)) {
      console.log("✓ Mem0 config already exists");
      return true;
    }

    mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true });

    const config = `{
  // Required if OPENMEMORY_API_KEY is not set in the environment.
  // "apiKey": "m0-your-api-key",

  // Mem0 Platform API base URL.
  // Leave this as-is unless you are using a self-hosted or proxy endpoint.
  "apiUrl": "https://api.mem0.ai",

  // Optional: workspace routing for Mem0 Platform API.
  // Leave empty to use the API key default scope.
  // "orgId": "",
  // "projectId": "",

  // Optional: additional regex patterns that trigger memory capture.
  // The built-in English trigger keywords remain enabled.
  // "keywordPatterns": ["\\\\bremember this\\\\b", "\\\\bnote this\\\\b"],

  // Optional: extra storage guidance appended when memory capture is triggered.
  // "filterPrompt": "Only store durable preferences, workflows, and project conventions.",

  // Optional: preemptive compaction threshold from 0 to 1.
  // Higher values compact less aggressively.
  "compactionThreshold": 0.8,

  // Retrieval tuning.
  // similarityThreshold and minSalience must be between 0 and 1.
  "similarityThreshold": 0.6,
  "minSalience": 0.3,

  // Result limits. Use positive integers only.
  "maxMemories": 5,
  "maxProjectMemories": 10,
  "maxProfileItems": 5,

  // Whether to inject the generated user profile into prompt context.
  "injectProfile": true,

  // Prefix used for generated scope tags and namespaces.
  "scopePrefix": "opencode",

  // Default sector used when saving memories.
  // Allowed values: "episodic", "semantic", "procedural", "emotional", "reflective"
  "defaultSector": "semantic"
}
`;

    writeFileSync(configPath, config);
    console.log(`✓ Created ${configPath}`);
    return true;
  } catch (err) {
    console.error("✗ Failed to create OpenMemory config:", err);
    return false;
  }
}

interface InstallOptions {
  tui: boolean;
  disableAutoCompact: boolean;
}

async function install(options: InstallOptions): Promise<number> {
  console.log("\n🧠 opencode-mem0 installer\n");

  const rl = options.tui ? createReadline() : null;
  let hasErrors = false;

  if (!hasBuiltPlugin()) {
    console.error(`✗ Built plugin entry not found at ${PLUGIN_ENTRY}`);
    console.error("  Run `bun run build` before running the installer.");
    if (rl) rl.close();
    return 1;
  }

  // Step 1: Register plugin in config
  console.log("Step 1: Register plugin in OpenCode config");
  const configPath = findOpencodeConfig();
  
  if (configPath) {
    if (options.tui) {
      const shouldModify = await confirm(rl!, `Add plugin to ${configPath}?`);
      if (!shouldModify) {
        console.log("Skipped.");
      } else {
        hasErrors = !addPluginToConfig(configPath) || hasErrors;
      }
    } else {
      hasErrors = !addPluginToConfig(configPath) || hasErrors;
    }
  } else {
    if (options.tui) {
      const shouldCreate = await confirm(rl!, "No OpenCode config found. Create one?");
      if (!shouldCreate) {
        console.log("Skipped.");
      } else {
        hasErrors = !createNewConfig() || hasErrors;
      }
    } else {
      hasErrors = !createNewConfig() || hasErrors;
    }
  }

  // Step 2: Create /mem0-init command
  console.log("\nStep 2: Create /mem0-init command");
  if (options.tui) {
    const shouldCreate = await confirm(rl!, "Add /mem0-init command?");
    if (!shouldCreate) {
      console.log("Skipped.");
    } else {
      hasErrors = !createCommand() || hasErrors;
    }
  } else {
    hasErrors = !createCommand() || hasErrors;
  }

  // Step 3: Create OpenMemory config
  console.log("\nStep 3: Create OpenMemory configuration");
  if (options.tui) {
    const shouldCreate = await confirm(rl!, "Create Mem0 config file?");
    if (!shouldCreate) {
      console.log("Skipped.");
    } else {
      hasErrors = !createOpenMemoryConfig() || hasErrors;
    }
  } else {
    hasErrors = !createOpenMemoryConfig() || hasErrors;
  }

  // Step 4: Configure Oh My OpenCode (if installed)
  const shouldConfigureOhMyOpencode =
    isOhMyOpencodeInstalled() || options.disableAutoCompact;

  if (shouldConfigureOhMyOpencode) {
    console.log("\nStep 4: Configure Oh My OpenCode");
    if (isOhMyOpencodeInstalled()) {
      console.log("Detected Oh My OpenCode plugin.");
    } else {
      console.log("Applying requested Oh My OpenCode hook configuration.");
    }
    console.log("OpenMemory handles context compaction, so the built-in context-window-limit-recovery hook should be disabled.");
    
    if (isAutoCompactAlreadyDisabled()) {
      console.log("✓ anthropic-context-window-limit-recovery hook already disabled");
    } else {
      if (options.tui) {
        const shouldDisable = await confirm(rl!, "Disable anthropic-context-window-limit-recovery hook to let OpenMemory handle context?");
        if (!shouldDisable) {
          console.log("Skipped.");
        } else {
          hasErrors = !disableAutoCompactHook() || hasErrors;
        }
      } else if (options.disableAutoCompact) {
        hasErrors = !disableAutoCompactHook() || hasErrors;
      } else {
        console.log("Skipped. Use --disable-context-recovery to disable the hook in non-interactive mode.");
      }
    }
  }

  // Step 5: Mem0 setup instructions
  console.log("\n" + "─".repeat(50));
  console.log("\n🚀 Final step: Configure Mem0\n");
  console.log("1. Create a Mem0 API key in the dashboard:");
  console.log("   https://app.mem0.ai/\n");
  console.log("2. Update ~/.config/opencode/mem0.jsonc with your key.");
  console.log("   Optional: also set orgId/projectId if your workspace requires them.\n");
  console.log("3. Reference docs:");
  console.log("   https://docs.mem0.ai/api-reference");
  console.log("\n" + "─".repeat(50));
  if (hasErrors) {
    console.log("\n✗ Setup finished with errors. Fix the failed steps above and rerun the installer.\n");
  } else {
    console.log("\n✓ Setup complete! Restart OpenCode to activate.\n");
  }

  if (rl) rl.close();
  return hasErrors ? 1 : 0;
}

function printHelp(): void {
  console.log(`
opencode-mem0 - Persistent memory for OpenCode agents using Mem0

Commands:
  install                    Install and configure the plugin
    --no-tui                 Run in non-interactive mode (for LLM agents)
    --disable-context-recovery   Disable Oh My OpenCode's context-window-limit-recovery hook (use with --no-tui)

Examples:
  bun run build && node ./dist/cli.js install
  bun run build && node ./dist/cli.js install --no-tui
  bun run build && node ./dist/cli.js install --no-tui --disable-context-recovery
`);
}

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
  printHelp();
  process.exit(0);
}

if (args[0] === "install") {
  const noTui = args.includes("--no-tui");
  const disableAutoCompact = args.includes("--disable-context-recovery");
  install({ tui: !noTui, disableAutoCompact }).then((code) => process.exit(code));
} else if (args[0] === "setup") {
  // Backwards compatibility
  console.log("Note: 'setup' is deprecated. Use 'install' instead.\n");
  const noTui = args.includes("--no-tui");
  const disableAutoCompact = args.includes("--disable-context-recovery");
  install({ tui: !noTui, disableAutoCompact }).then((code) => process.exit(code));
} else {
  console.error(`Unknown command: ${args[0]}`);
  printHelp();
  process.exit(1);
}
