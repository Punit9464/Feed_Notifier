import { integer, pgTable, text } from 'drizzle-orm/pg-core'
import constants from '../../config/constants.js';

export const prefixTable = pgTable('prefix', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    guildId: text().notNull().unique(),
    prefix: text().notNull().default(constants.DISCORD_CONSTANTS.PREFIX)
});