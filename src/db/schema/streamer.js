import { integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

export const streamersTable = pgTable('streamers', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    streamerId: text().notNull(),
    slug: text().notNull(),
    platform: text({ enum: ['youtube-live', 'youtube-videos', 'kick'] }).notNull()
}, (t) => [
    uniqueIndex('streamer_streamer_platform_unique').on(t.streamerId, t.platform),
    uniqueIndex('streamer_platform_slug_unique').on(t.platform, t.slug)
]);