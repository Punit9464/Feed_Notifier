import { integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

export const streamSubsTable = pgTable('streamdiscordsubs', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    streamerId: integer(),
    guildId: text().notNull(),
    discordWebhookLink: text().notNull()
}, (table) => [
    uniqueIndex('streamdiscordsubs_guild_streamer_unique').on(table.streamerId, table.guildId)
]);