import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// Users table - stores GitHub OAuth user info
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  githubId: text('github_id').notNull().unique(),
  githubUsername: text('github_username').notNull(),
  githubAccessToken: text('github_access_token'),
  claudeOauthToken: text('claude_oauth_token'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

// Trials table - represents a single gladiator battle
export const trials = sqliteTable('trials', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  repoUrl: text('repo_url').notNull(),
  challengePrompt: text('challenge_prompt').notNull(),
  trialType: text('trial_type', { enum: ['GLADIATOR', 'LEGION'] }).notNull(),
  status: text('status', {
    enum: ['PENDING', 'PLANNING', 'RUNNING', 'JUDGING', 'COMPLETED', 'FAILED'],
  })
    .notNull()
    .default('PENDING'),
  lanistaPlan: text('lanista_plan'), // JSON string: Lanista's setup/planning output
  arbiterPlan: text('arbiter_plan'), // JSON string: Arbiter's judging criteria
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
})

// Gladiators table - AI agents competing in trials
export const gladiators = sqliteTable('gladiators', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  trialId: text('trial_id')
    .notNull()
    .references(() => trials.id),
  name: text('name').notNull(),
  persona: text('persona').notNull(), // The gladiator's system prompt/personality
  model: text('model').notNull(), // e.g., "claude-sonnet-4.5"
  temperature: integer('temperature').notNull().default(1), // Stored as integer (0-100)
  tools: text('tools').notNull(), // JSON string: array of tool names
  branchName: text('branch_name').notNull(),
  status: text('status', {
    enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'],
  })
    .notNull()
    .default('PENDING'),
  responseContent: text('response_content'), // Final output from the gladiator
  streamLog: text('stream_log'), // JSON string: SSE event log
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

// Judges table - AI evaluators for trials
export const judges = sqliteTable('judges', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  trialId: text('trial_id')
    .notNull()
    .references(() => trials.id),
  name: text('name').notNull(),
  focus: text('focus').notNull(), // What this judge evaluates (e.g., "code quality", "test coverage")
  model: text('model').notNull(),
  evaluation: text('evaluation'), // JSON string: judge's detailed evaluation
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

// Verdicts table - final decision for each trial
export const verdicts = sqliteTable('verdicts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  trialId: text('trial_id')
    .notNull()
    .unique()
    .references(() => trials.id),
  summary: text('summary').notNull(), // High-level verdict summary
  winnerGladiatorId: text('winner_gladiator_id').references(() => gladiators.id),
  reasoning: text('reasoning').notNull(), // Detailed explanation
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

// Decrees table - actions taken after verdict (like merging code)
export const decrees = sqliteTable('decrees', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  trialId: text('trial_id')
    .notNull()
    .references(() => trials.id),
  actionType: text('action_type', {
    enum: ['MERGE', 'CLOSE_PR', 'CREATE_ISSUE', 'COMMENT'],
  }).notNull(),
  actionDetails: text('action_details').notNull(), // JSON string: details of the action
  consulConversation: text('consul_conversation'), // JSON string: Consul's decision-making process
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

// RepoSetups table - cached repo setup instructions
export const repoSetups = sqliteTable('repo_setups', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  repoUrl: text('repo_url').notNull().unique(),
  setupMd: text('setup_md'), // SETUP.md content
  setupSh: text('setup_sh'), // setup.sh script
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})
