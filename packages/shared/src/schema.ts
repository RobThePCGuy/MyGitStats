import { z } from "zod";

// --- Config ---

export const ConfigSchema = z.object({
  includeForks: z.boolean().default(false),
  includeArchived: z.boolean().default(false),
  orgAllowlist: z.array(z.string()).default([]),
  repoAllowlist: z.array(z.string()).default([]),
  repoBlocklist: z.array(z.string()).default([]),
  maxConcurrency: z.number().int().min(1).max(20).default(5),
  publishPrivateRepos: z.array(z.string()).default([]),
});

export type Config = z.infer<typeof ConfigSchema>;

// --- Traffic ---

export const TrafficDaySchema = z.object({
  views: z.number().int().min(0),
  viewsUnique: z.number().int().min(0),
  clones: z.number().int().min(0),
  clonesUnique: z.number().int().min(0),
});

export type TrafficDay = z.infer<typeof TrafficDaySchema>;

// --- Snapshot ---

export const SnapshotSchema = z.object({
  stars: z.number().int().min(0),
  forks: z.number().int().min(0),
  openIssues: z.number().int().min(0),
  openPRs: z.number().int().min(0),
  watchers: z.number().int().min(0),
  size: z.number().int().min(0),
});

export type Snapshot = z.infer<typeof SnapshotSchema>;

// --- Contribution Day ---

export const ContributionDaySchema = z.object({
  date: z.string(),
  count: z.number().int().min(0),
});

export type ContributionDay = z.infer<typeof ContributionDaySchema>;

// --- Referrer ---

export const ReferrerSchema = z.object({
  referrer: z.string(),
  count: z.number().int().min(0),
  uniques: z.number().int().min(0),
});

export type Referrer = z.infer<typeof ReferrerSchema>;

// --- Popular Path ---

export const PopularPathSchema = z.object({
  path: z.string(),
  title: z.string(),
  count: z.number().int().min(0),
  uniques: z.number().int().min(0),
});

export type PopularPath = z.infer<typeof PopularPathSchema>;

// --- Per-repo entry in a daily file ---

export const DailyRepoEntrySchema = z.object({
  fullName: z.string(),
  isPrivate: z.boolean().default(false),
  traffic: TrafficDaySchema.optional(),
  snapshot: SnapshotSchema.optional(),
});

export type DailyRepoEntry = z.infer<typeof DailyRepoEntrySchema>;

// --- Daily File (one per calendar day) ---

export const DailyFileSchema = z.object({
  schemaVersion: z.literal(1),
  date: z.string(),
  collectedAt: z.string(),
  collectorVersion: z.string(),
  repos: z.record(z.coerce.number(), DailyRepoEntrySchema),
  contributions: z.array(ContributionDaySchema).optional(),
});

export type DailyFile = z.infer<typeof DailyFileSchema>;

// --- Window File (14-day referrers/paths aggregate) ---

export const WindowRepoEntrySchema = z.object({
  fullName: z.string(),
  referrers: z.array(ReferrerSchema),
  paths: z.array(PopularPathSchema),
});

export type WindowRepoEntry = z.infer<typeof WindowRepoEntrySchema>;

export const WindowFileSchema = z.object({
  schemaVersion: z.literal(1),
  date: z.string(),
  collectedAt: z.string(),
  collectorVersion: z.string(),
  repos: z.record(z.coerce.number(), WindowRepoEntrySchema),
});

export type WindowFile = z.infer<typeof WindowFileSchema>;

// --- Repo Meta ---

export const RepoMetaEntrySchema = z.object({
  id: z.number().int(),
  fullName: z.string(),
  isPrivate: z.boolean(),
  isFork: z.boolean(),
  isArchived: z.boolean(),
  defaultBranch: z.string(),
  language: z.string().nullable(),
  description: z.string().nullable(),
});

export type RepoMetaEntry = z.infer<typeof RepoMetaEntrySchema>;

export const RepoMetaSchema = z.object({
  schemaVersion: z.literal(1),
  collectedAt: z.string(),
  repos: z.array(RepoMetaEntrySchema),
});

export type RepoMeta = z.infer<typeof RepoMetaSchema>;

// --- Last Run ---

export const LastRunSchema = z.object({
  schemaVersion: z.literal(1),
  startedAt: z.string(),
  finishedAt: z.string(),
  collectorVersion: z.string(),
  reposDiscovered: z.number().int().min(0),
  reposCollected: z.number().int().min(0),
  errors: z.array(z.string()),
});

export type LastRun = z.infer<typeof LastRunSchema>;
