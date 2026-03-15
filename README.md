# opencode-openmemory

[![npm version](https://badge.fury.io/js/@happycastle%2Fopencode-openmemory.svg)](https://www.npmjs.com/package/@happycastle%2Fopencode-openmemory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Persistent memory for OpenCode agents** using [Mem0 Platform API](https://docs.mem0.ai/api-reference).

A fork of [opencode-supermemory](https://github.com/supermemoryai/opencode-supermemory), adapted to work with Mem0's hosted memory API.

## Features

- **Hosted memory backend**: Memories are stored and queried through Mem0's API
- **Automatic context injection**: User profile, project memory, and relevant memories injected into conversations
- **Explicit & implicit memory capture**: Save memories with "remember this" or let the agent extract knowledge automatically
- **Scope separation**: User-level (cross-project) vs project-level memories
- **Context compaction**: Smart summarization when context window fills up

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                   OpenCode (Plugin)                           │
│  - Injection Policy (format, token budget, priority)          │
│  - Memory Capture Policy (explicit "remember", implicit)      │
│  - Scope Router (user_id, project_id)                         │
└───────────────────┬───────────────────────────────────────────┘
                    │
                    v
┌───────────────────────────────────────────────────────────────┐
│                   Mem0 Platform API                            │
│  - Store: raw notes / facts / snippets                         │
│  - Index: embeddings + metadata (scope/recency/type)           │
│  - Retrieval: hosted search and ranking                        │
│  - Default: https://api.mem0.ai                                │
└───────────────────────────────────────────────────────────────┘
```

## Installation

### 1. Install the plugin

```bash
bunx @eddy.soungmin/opencode-openmemory@latest install
```

Or manually add to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugin": ["@happycastle/opencode-openmemory@latest"]
}
```

### 2. Create a Mem0 API key

Create an API key in the [Mem0 dashboard](https://app.mem0.ai/) and keep it available for configuration.

Optional: if your Mem0 workspace uses explicit org/project routing, collect those IDs too.

### 3. Restart OpenCode

The plugin will connect to Mem0 Platform API at `https://api.mem0.ai`.

## Configuration

Create `~/.config/opencode/openmemory.jsonc`:

```jsonc
{
  // Required if OPENMEMORY_API_KEY is not set in the environment.
  "apiKey": "m0-...",

  // Mem0 Platform API base URL.
  // Leave this as-is unless you use a self-hosted or proxy endpoint.
  "apiUrl": "https://api.mem0.ai",

  // Optional: workspace routing for Mem0 Platform API.
  // Leave empty to use the API key default scope.
  "orgId": "",
  "projectId": "",

  // Optional: additional regex patterns that trigger memory capture.
  // Built-in English trigger keywords remain enabled.
  "keywordPatterns": ["\\bremember this\\b", "\\bnote this\\b"],

  // Optional: extra storage guidance appended to the memory-capture nudge.
  "filterPrompt": "Only store durable preferences, workflows, and project conventions.",

  // Optional: preemptive compaction threshold from 0 to 1.
  // Higher values compact less aggressively.
  "compactionThreshold": 0.8,

  // Retrieval tuning. similarityThreshold and minSalience must be between 0 and 1.
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
```

## Usage

### Automatic Context Injection

On the first message of each session, the plugin automatically injects:

1. **User Profile**: Cross-project preferences and patterns
2. **Project Knowledge**: Project-specific memories from the current directory
3. **Relevant Memories**: Semantically similar memories to the current query

### Explicit Memory Saving

Use trigger phrases to save memories:

```
"Remember that we use Prettier with single quotes"
"Save this: always run tests before committing"
"Keep in mind that the auth service is in /src/lib/auth"
```

### Tool Commands

The `openmemory` tool is available with these modes:

| Mode | Description | Arguments |
|------|-------------|-----------|
| `add` | Store a new memory | `content`, `type?`, `scope?` |
| `search` | Search memories | `query`, `scope?`, `limit?` |
| `profile` | View user profile | `query?` |
| `list` | List recent memories | `scope?`, `limit?` |
| `forget` | Remove a memory | `memoryId`, `scope?` |
| `feedback` | Send Mem0 feedback for a memory | `memoryId`, `feedback?`, `reason?` |
| `help` | Show usage guide | - |

**Scopes:**
- `user`: Cross-project preferences and knowledge
- `project`: Project-specific knowledge (default)

**Memory Types:**
- `project-config`: Tech stack, commands, tooling
- `architecture`: Codebase structure, components, data flow
- `learned-pattern`: Conventions specific to this codebase
- `error-solution`: Known issues and their fixes
- `preference`: Coding style preferences
- `conversation`: Session summaries

You can also configure the same values with environment variables:

```bash
export OPENMEMORY_API_URL="https://api.mem0.ai"
export OPENMEMORY_API_KEY="m0-..."
export OPENMEMORY_ORG_ID=""
export OPENMEMORY_PROJECT_ID=""
```

### Initialize Memory

Run the `/openmemory-init` command to deeply research your codebase and populate memory:

```
/openmemory-init
```

## Context Compaction

When the context window fills up (80% by default), the plugin:

1. Injects project knowledge into the summary prompt
2. Triggers OpenCode's summarization
3. Saves the summary as a memory for future sessions
4. Automatically resumes the conversation

## Usage with Oh My OpenCode

If you're using [Oh My OpenCode](https://github.com/code-yeongyu/oh-my-opencode), disable its built-in auto-compact hook to let this plugin handle context compaction:

Add to `~/.config/opencode/oh-my-opencode.json`:

```json
{
  "disabled_hooks": ["anthropic-context-window-limit-recovery"]
}
```

## Development

```bash
# Clone
git clone https://github.com/happycastle114/opencode-openmemory.git
cd opencode-openmemory

# Install dependencies
bun install

# Type check
bun run typecheck

# Build
bun run build

# Development (watch mode)
bun run dev

# Local testing with OpenCode
bun run build && opencode --plugin ./dist/index.js
```

## Comparison with opencode-supermemory

| Feature | opencode-supermemory | @eddy.soungmin/opencode-openmemory |
|---------|---------------------|-------------------------------------|
| Backend | Supermemory Cloud | Mem0 Platform API |
| Data Location | Cloud | Mem0 workspace |
| Auth | API key | API key |
| Operations | Hosted | Hosted |

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Credits

- Based on [opencode-supermemory](https://github.com/supermemoryai/opencode-supermemory) by Supermemory
- Uses [Mem0](https://mem0.ai/) Platform API
- Developed by [@happycastle114](https://github.com/happycastle114)

## Special Thanks

- [Oh My OpenCode](https://github.com/code-yeongyu/oh-my-opencode) - This plugin was developed using Oh My OpenCode's powerful agent orchestration capabilities
