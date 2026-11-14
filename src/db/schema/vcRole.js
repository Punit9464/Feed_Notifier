import { integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

export const vcRole = pgTable('vcroles', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    guildId: text().notNull(),
    categoryId: text().notNull(),
    roleId: text().notNull()
}, (self) => [
    uniqueIndex('vcrole_category_role_guild_unique').on(self.categoryId, self.roleId, self.guildId)
]);