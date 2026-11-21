import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export interface CaptionWord {
  word: string;
  start: number;
  end: number;
  emphasis?: boolean;
}

export interface CaptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  words: CaptionWord[];
}

export interface CaptionStyleConfig {
  template: 'kinetic_pop' | 'minimal_broadcast' | 'bold_highlight' | 'clean_editorial';
  fontFamily: string;
  fontSize: number;
  primaryColor: string;
  highlightColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  position: 'bottom' | 'center' | 'top';
  showProgressBar: boolean;
  showHookTitle: boolean;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  speaker: string;
  text: string;
  words?: CaptionWord[];
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('user'),
  plan: text('plan').notNull().default('starter'),
  creditsMinutes: integer('credits_minutes').notNull().default(60),
  defaultLanguage: text('default_language').notNull().default('en'),
  defaultAspectRatio: text('default_aspect_ratio').notNull().default('9:16'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  sourceType: text('source_type').notNull(),
  sourceUrl: text('source_url'),
  videoPath: text('video_path'),
  durationSeconds: doublePrecision('duration_seconds').notNull().default(0),
  width: integer('width').notNull().default(1920),
  height: integer('height').notNull().default(1080),
  targetClipDuration: text('target_clip_duration').notNull().default('30-60'),
  outputFormat: text('output_format').notNull().default('9:16'),
  language: text('language').notNull().default('auto'),
  removeSilences: boolean('remove_silences').notNull().default(true),
  smartCrop: boolean('smart_crop').notNull().default(true),
  status: text('status').notNull().default('queued'),
  progress: integer('progress').notNull().default(0),
  stageMessage: text('stage_message').notNull().default('Queued for processing'),
  errorMessage: text('error_message'),
  transcriptJson: jsonb('transcript_json').$type<TranscriptSegment[]>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const clips = pgTable('clips', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  hookText: text('hook_text').notNull().default(''),
  summary: text('summary').notNull().default(''),
  startTime: doublePrecision('start_time').notNull(),
  endTime: doublePrecision('end_time').notNull(),
  duration: doublePrecision('duration').notNull(),
  engagementScore: integer('engagement_score').notNull().default(85),
  speakerFocusX: doublePrecision('speaker_focus_x').notNull().default(0.5),
  aspectRatio: text('aspect_ratio').notNull().default('9:16'),
  captionStyle: jsonb('caption_style').$type<CaptionStyleConfig>().notNull(),
  captionsJson: jsonb('captions_json').$type<CaptionSegment[]>().notNull(),
  previewVideoPath: text('preview_video_path'),
  renderedVideoPath: text('rendered_video_path'),
  exportQuality: text('export_quality').notNull().default('1080p'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const jobs = pgTable('jobs', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  jobType: text('job_type').notNull().default('auto_clip'),
  status: text('status').notNull().default('queued'),
  progress: integer('progress').notNull().default(0),
  logsJson: jsonb('logs_json').$type<string[]>().notNull().default([]),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  clips: many(clips),
  jobs: many(jobs),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  clips: many(clips),
  jobs: many(jobs),
}));

export const clipsRelations = relations(clips, ({ one }) => ({
  project: one(projects, {
    fields: [clips.projectId],
    references: [projects.id],
  }),
  owner: one(users, {
    fields: [clips.userId],
    references: [users.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  project: one(projects, {
    fields: [jobs.projectId],
    references: [projects.id],
  }),
  owner: one(users, {
    fields: [jobs.userId],
    references: [users.id],
  }),
}));
