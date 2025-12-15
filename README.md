# ⚡ Thunderdome

> *Many gladiators enter. One answer leaves.*

A multi-agent AI battle arena where Claude instances compete to solve challenges, judged by AI arbiters, with you as the final Editor.

## What is Thunderdome?

Instead of asking one LLM for an answer, Thunderdome orchestrates competitive AI problem-solving. The **Lanista** (AI competition designer) spawns multiple Claude "gladiators" with different perspectives to attack your problem. Judges evaluate their responses, and you—the **Editor**—make the final call.

**The key insight:** Diversity of approach surfaces better solutions. Multiple perspectives beat a single query.

## Quick Start

### Prerequisites

- Node.js 18+
- Docker (for running gladiator containers)
- GitHub account (for OAuth)
- Claude API token (per-user)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/thunderdome.git
cd thunderdome

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials (see Environment Variables below)
nano .env

# Set up the database
npm run db:push

# Start development server
npm run dev
```

Visit `http://localhost:3000` and sign in with GitHub.

## Environment Variables

Required environment variables in `.env`:

```bash
# Database
DATABASE_URL=./thunderdome.db

# GitHub OAuth (create app at github.com/settings/developers)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# NextAuth.js
NEXTAUTH_SECRET=your_random_secret_string
NEXTAUTH_URL=http://localhost:3000

# Encryption (for storing user Claude tokens)
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=your_encryption_key_64_chars
```

### Getting Credentials

1. **GitHub OAuth:** Create an OAuth App at https://github.com/settings/developers
   - Homepage URL: `http://localhost:3000`
   - Callback URL: `http://localhost:3000/api/auth/callback/github`

2. **NextAuth Secret:** Generate with `openssl rand -base64 32`

3. **Encryption Key:** Generate with `openssl rand -hex 32`

4. **Claude API Token:** Each user provides their own token in Settings after login

## Development Commands

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run start      # Start production server
npm run lint       # Run Biome linter
npm run lint:fix   # Fix linting issues
npm run format     # Format code with Biome
npm run check      # Lint and format in one command

# Database commands
npm run db:generate  # Generate migrations
npm run db:migrate   # Run migrations
npm run db:push      # Push schema changes
npm run db:studio    # Open Drizzle Studio
```

## Architecture Overview

Thunderdome is built with:

- **Next.js 16** - React framework with App Router
- **NextAuth.js** - GitHub OAuth authentication
- **Drizzle ORM** - Type-safe database layer (SQLite)
- **Claude Agent SDK** - AI agent orchestration
- **Docker** - Sandboxed gladiator execution
- **Tailwind CSS** - Styling
- **Biome** - Fast linting and formatting

### Project Structure

```
thunderdome/
├── src/
│   ├── app/                    # Next.js app router
│   │   ├── api/                # API routes
│   │   │   ├── auth/           # NextAuth endpoints
│   │   │   ├── github/         # GitHub integration
│   │   │   ├── repos/          # Repository analysis
│   │   │   └── trials/         # Trial orchestration
│   │   ├── trials/             # Trial pages
│   │   └── settings/           # User settings
│   ├── components/             # React components
│   │   ├── auth/               # Authentication
│   │   ├── setup/              # Setup discovery
│   │   └── trials/             # Trial UI
│   ├── db/                     # Database schema & config
│   ├── lib/                    # Core logic
│   │   ├── claude/             # Claude SDK wrapper
│   │   ├── docker/             # Docker container management
│   │   ├── github/             # GitHub API
│   │   └── trial/              # Trial orchestration
│   │       ├── arbiter/        # Judge selection
│   │       ├── code-battle/    # Code battle mode
│   │       ├── consul/         # Post-battle dialogue
│   │       ├── gladiator/      # Gladiator execution
│   │       └── lanista/        # Gladiator design
│   └── types/                  # TypeScript types
└── drizzle/                    # Database migrations
```

## The Battle Flow

### 1. Trial Creation

Users create a "trial" by:
- Providing a challenge/question
- Optionally linking a GitHub repository for context
- Selecting battle mode (Code Battle vs Classic)

### 2. Lanista (Gladiator Design)

The Lanista analyzes the challenge and:
- Designs 3 gladiators with different perspectives
- Assigns each a unique focus (e.g., security, performance, simplicity)
- Configures tools and parameters per gladiator

**Gladiator Archetypes:**
- **The Pragmatist** - Fast, practical solutions
- **The Paranoid** - Security-first approach
- **The Minimalist** - Simplest possible solution
- **The Academic** - Research-backed answers
- **The Contrarian** - Challenges conventional wisdom

### 3. Battle Execution

Gladiators run in parallel:
- **Classic Mode:** Direct challenge response
- **Code Battle Mode:** Containerized execution with repo access
  - Each gladiator gets a Docker container
  - Full repo clone and Claude Agent SDK access
  - Produces code changes and analysis

### 4. Arbiter (Judge Selection)

The Arbiter sees all gladiator outputs and:
- Designs judges appropriate for what was produced
- Spawns judge instances to evaluate from different angles
- Collects evaluations with scores and rankings

### 5. Verdict Synthesis

Judges' evaluations are aggregated into a final verdict:
- Overall winner
- Scores per gladiator
- Strengths and weaknesses
- Recommendations

### 6. Consul (Interactive Dialogue)

After battle, the Consul enables:
- Discussing results with an AI guide
- Asking clarifying questions
- Requesting synthesis or combinations
- Planning next steps

### 7. Editor Decree

You make the final call:
- Export results as markdown
- Create a new trial with refined challenge
- Review individual gladiator outputs

## Code Battle Mode

Code Battle is Thunderdome's signature feature for development challenges.

**How it works:**

1. User provides a GitHub repository and task
2. Lanista designs gladiators specialized for the codebase
3. Each gladiator gets:
   - Isolated Docker container
   - Full repo clone
   - Claude Agent SDK with filesystem access
   - Ability to read, analyze, and propose changes
4. Gladiators analyze the repo and produce solutions
5. Judges evaluate code quality, approach, and correctness

**Use cases:**

- "Add authentication to this API"
- "Refactor this module for better testability"
- "Find and fix security vulnerabilities"
- "Optimize this database query"

## API Reference

### Trial API

```typescript
// Start a trial
POST /api/trials/:id/start
{
  mode: 'classic' | 'code'
}

// Stream trial updates
GET /api/trials/:id/stream

// Query Consul
POST /api/trials/:id/consul
{
  message: string,
  history: Message[]
}

// Export results
GET /api/trials/:id/export
```

### GitHub API

```typescript
// List user repositories
GET /api/github/repos

// Analyze repository setup
GET /api/repos/:owner/:repo/setup
```

## Security

- User Claude API tokens encrypted at rest using `ENCRYPTION_KEY`
- GitHub OAuth with restricted scopes
- Docker containers isolated per gladiator
- No shared state between battles
- Rate limiting on API endpoints

## Performance

- Parallel gladiator execution
- Streaming results via Server-Sent Events
- Database connection pooling
- Docker container lifecycle management
- Efficient token usage tracking

## Troubleshooting

### "No Claude API token configured"

Each user must provide their own Claude API token:
1. Go to Settings in the app
2. Enter your Anthropic API key
3. Token is encrypted and stored per-user

### "Docker connection failed"

Ensure Docker is running:
```bash
docker ps  # Should list running containers
```

### Database issues

Reset the database:
```bash
rm thunderdome.db
npm run db:push
```

### Build errors

Clear Next.js cache:
```bash
rm -rf .next
npm run build
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run check` to lint and format
5. Run `npm run build` to verify
6. Submit a pull request

## License

MIT - See LICENSE file for details.

## Credits

Built with the [Claude Agent SDK](https://github.com/anthropics/anthropic-sdk-typescript) and inspired by the ancient Roman gladiatorial tradition. May the best answer win.
