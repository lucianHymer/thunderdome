# Issue 13: Biome Setup & Repo Cleanup

> **Wave 6** - Final polish after full implementation
> **Run after all other issues complete**

## Overview

Set up Biome for TypeScript/JavaScript linting and formatting, run a full lint pass, and ruthlessly clean up the repo. Remove unnecessary files, consolidate documentation into a single good README, and ensure the codebase is production-ready.

## Why Biome?

- **Fast**: Written in Rust, 10-100x faster than ESLint + Prettier
- **All-in-one**: Linter + formatter in one tool
- **Zero config**: Sensible defaults, minimal configuration
- **TypeScript-first**: Built for modern TypeScript

## Tasks

### 1. Install Biome

```bash
npm install --save-dev --save-exact @biomejs/biome
npx @biomejs/biome init
```

### 2. Configure Biome

Create/update `biome.json`:
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "complexity": {
        "noExcessiveCognitiveComplexity": "warn"
      },
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error"
      },
      "style": {
        "noNonNullAssertion": "warn",
        "useConst": "error",
        "useTemplate": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn",
        "noConsoleLog": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "asNeeded"
    }
  },
  "files": {
    "ignore": [
      "node_modules",
      ".next",
      "dist",
      "drizzle",
      "*.md"
    ]
  }
}
```

### 3. Add Package Scripts

Update `package.json`:
```json
{
  "scripts": {
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "check": "biome check --write ."
  }
}
```

### 4. Remove ESLint/Prettier (if present)

```bash
# Remove old linting tools
npm uninstall eslint prettier eslint-config-next @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react eslint-config-prettier

# Remove config files
rm -f .eslintrc* .prettierrc* .eslintignore .prettierignore
```

### 5. Run Full Lint & Fix

```bash
# First pass - see what we're dealing with
npx biome check .

# Fix everything auto-fixable
npx biome check --write .

# Format all files
npx biome format --write .
```

### 6. Set Up Pre-commit Hook (Optional)

```bash
# Using lefthook (lighter than husky)
npm install --save-dev lefthook
npx lefthook install
```

Create `lefthook.yml`:
```yaml
pre-commit:
  commands:
    biome:
      glob: "*.{js,ts,jsx,tsx,json}"
      run: npx biome check --write {staged_files}
```

---

## Repo Cleanup Checklist

### Files to Review/Remove

- [ ] **`/issues/*.md`** - Keep or move to GitHub wiki? (Probably remove after issues are in GitHub)
- [ ] **Duplicate documentation** - Any `.md` files that duplicate GitHub issues?
- [ ] **Old config files** - `.eslintrc`, `.prettierrc`, etc.
- [ ] **Unused dependencies** - Run `npx depcheck`
- [ ] **Dead code** - Unused exports, commented-out code
- [ ] **Console.logs** - Remove debug logging (Biome will flag these)
- [ ] **TODO comments** - Resolve or create issues for them
- [ ] **Test files without tests** - Empty test files
- [ ] **Backup files** - `*.bak`, `*.old`, `*~`
- [ ] **OS files** - `.DS_Store`, `Thumbs.db`
- [ ] **IDE files** - `.idea/`, `.vscode/` (unless shared settings)

### Update .gitignore

Ensure `.gitignore` includes:
```gitignore
# Dependencies
node_modules/

# Build
.next/
dist/
out/

# Environment
.env
.env.local
.env.*.local

# IDE
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Debug
npm-debug.log*

# Biome
.biome/

# Database
*.db
*.sqlite
```

---

## README Consolidation

### Delete These (if they exist)
- `CONTRIBUTING.md` (overkill for now)
- `CHANGELOG.md` (let git history be the changelog)
- `docs/` folder (unless truly needed)
- `*.md` files that aren't README

### Keep/Create
**One good README.md** with:

```markdown
# ⚡ Thunderdome

> Many gladiators enter. One answer leaves.

Multi-agent LLM battle arena where AI gladiators compete to solve challenges.

## Quick Start

\`\`\`bash
# Install
npm install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
\`\`\`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app secret |
| `NEXTAUTH_SECRET` | Random secret for sessions |
| `NEXTAUTH_URL` | App URL (http://localhost:3000) |
| `ENCRYPTION_KEY` | 32-byte hex key for token encryption |

## Development

\`\`\`bash
npm run dev       # Start dev server
npm run lint      # Run Biome linter
npm run check     # Lint + format
npm run db:studio # Open Drizzle Studio
\`\`\`

## Architecture

- **Next.js 15** - App Router, API routes, SSE streaming
- **Drizzle ORM** - Type-safe database access
- **Claude Agent SDK** - AI agent orchestration
- **Biome** - Linting and formatting

## The Battle Flow

1. **Lanista** designs gladiators based on your challenge
2. **Gladiators** compete in parallel with different perspectives
3. **Arbiter** designs judges based on gladiator outputs
4. **Judges** evaluate and produce a verdict
5. **Consul** helps you decide what to do with the results

## License

MIT
\`\`\`

---

## Code Quality Audit

### Things to Check

1. **Type Safety**
   - No `any` types without justification
   - Proper null checks
   - Zod schemas for all API inputs

2. **Error Handling**
   - All async functions have try/catch
   - Errors logged with context
   - User-friendly error messages

3. **Security**
   - No secrets in code
   - All user inputs validated
   - SQL injection protection (Drizzle handles this)
   - XSS protection (React handles this)

4. **Performance**
   - No unnecessary re-renders
   - Database queries optimized
   - SSE connections cleaned up

5. **Consistency**
   - Consistent naming (camelCase, etc.)
   - Consistent file structure
   - Consistent error patterns

### Biome Rules Rationale

| Rule | Setting | Why |
|------|---------|-----|
| `noUnusedVariables` | error | Dead code is confusing |
| `noUnusedImports` | error | Clean imports |
| `noExplicitAny` | warn | Push toward type safety |
| `noConsoleLog` | warn | Remove debug logs before prod |
| `useConst` | error | Immutability by default |
| `useTemplate` | error | Template literals > concatenation |
| `noNonNullAssertion` | warn | Prefer explicit null handling |

---

## Acceptance Criteria

- [ ] Biome installed and configured
- [ ] `npm run lint` passes with no errors
- [ ] `npm run check` runs lint + format
- [ ] ESLint/Prettier removed (if present)
- [ ] No unused dependencies
- [ ] No dead code or commented-out code
- [ ] No debug console.logs
- [ ] Single, comprehensive README.md
- [ ] No duplicate/unnecessary documentation
- [ ] .gitignore is complete
- [ ] Pre-commit hook works (optional)

---

## Final Repo Structure

After cleanup, the repo should look like:

```
thunderdome/
├── src/
│   ├── app/           # Next.js app router
│   ├── components/    # React components
│   ├── db/            # Database schema and connection
│   ├── lib/           # Business logic
│   └── hooks/         # React hooks
├── drizzle/           # Database migrations
├── public/            # Static assets
├── .env.example       # Environment template
├── .gitignore
├── biome.json         # Biome config
├── drizzle.config.ts  # Drizzle config
├── next.config.js     # Next.js config
├── package.json
├── README.md          # The one README to rule them all
└── tsconfig.json
```

No extra markdown files, no docs folder, no cruft.

---

## Dependencies

**Depends on**: All previous issues (run last)
**Blocks**: None (final issue)
