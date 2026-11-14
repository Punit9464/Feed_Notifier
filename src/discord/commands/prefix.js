import { getDbInstance } from "../../db/index.js";
import { prefixTable } from "../../db/schema/prefix.js";
import { eq } from 'drizzle-orm';

export const name = 'prefix';
export const description = 'Command to change the prefix configuration of the bot for current server';
export const aliases = ['set-prefix'];
export const run = async (client, message, args, prefix) => {
    if(args.length === 0)
        return await message.reply({ content: `Current Prefix Config for the server is: \`${prefix}\`` });

    if(!message.member.permissions.has('ManageGuild'))
        return await message.reply({
            content: '\`Manage Guild\` Permission is required to use this command.'
        });

    if(args.length > 1)
        return await message.reply({ content: 'Correct command usage: set-prefix {new_prefix}' });

    const newPrefix = args[0];
    if(newPrefix.length > 3)
        return await message.reply({ content: 'Prefix cannot be this long. (allowed upto 3 chars)' });

    if(newPrefix === prefix)
        return await message.reply({ content: 'This is the current prefix configuration. No Changes made.' });

    const db = await getDbInstance();

    if(newPrefix === client.defaultPrefix) {
        await db.delete(prefixTable).where(eq(prefixTable.guildId, message.guildId));
        return await message.reply({ content: 'Reset Prefix Configuration. New Prefix: ' + `\`${client.defaultPrefix}\`` });
    }

    await db.insert(prefixTable).values({ guildId: message.guildId, prefix: newPrefix })
        .onConflictDoUpdate({
            target: prefixTable.guildId,
            set: {
                prefix: newPrefix
            }
        });
    return await message.reply({ content: 'Guild Prefix is set to: ' + `\`${newPrefix}\`` });
}