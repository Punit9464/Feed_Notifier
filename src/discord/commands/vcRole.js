import { and, eq } from "drizzle-orm";
import { ChannelType } from "discord.js";

import { getDbInstance } from "../../db/index.js";
import { vcRole } from "../../db/schema/vcRole.js";

export const name = "vc-role";
export const aliases = ["vcrole"];
export const description =
    "Configures roles for voice channels under specific categories";

export const run = async (client, message, args, prefix) => {
    if (!message.member.permissions.has("ManageGuild")) {
        return message.reply({
            content: "You require `Manage Guild` permissions."
        });
    }

    if (!args.length) {
        return message.reply({
            content:
                `Provide a valid option: \`add\`, \`remove\`, \`list\`\n` +
                `Usage: \`${prefix}vcrole <add|remove|list>\``
        });
    }

    const db = await getDbInstance();
    const type = args[0].toLowerCase();

    if (!["add", "remove", "list"].includes(type)) {
        return message.reply({
            content: "Invalid option. Allowed options are `add`, `remove`, `list`."
        });
    }

    // Resolve category using ID, channel mention, or name.
    const resolveCategory = (input) => {
        if (!input) return null;

        const categoryId = input.replace(/[<#>]/g, "");

        const categoryById = message.guild.channels.cache.get(categoryId);

        if (
            categoryById &&
            categoryById.type === ChannelType.GuildCategory
        ) {
            return categoryById;
        }

        return message.guild.channels.cache.find(
            channel =>
                channel.type === ChannelType.GuildCategory &&
                channel.name.toLowerCase() === input.toLowerCase()
        ) ?? null;
    };

    // Resolve role using ID, role mention, or name.
    const resolveRole = (input) => {
        if (!input) return null;

        const roleId = input.replace(/[<@&>]/g, "");

        const roleById = message.guild.roles.cache.get(roleId);

        if (roleById) {
            return roleById;
        }

        return message.guild.roles.cache.find(
            role => role.name.toLowerCase() === input.toLowerCase()
        ) ?? null;
    };

    // ADD
    if (type === "add") {
        if (args.length !== 3) {
            return message.reply({
                content:
                    `Valid usage: \`${prefix}vcrole add {category} {role}\`\n` +
                    `Example: \`${prefix}vcrole add 123456789012345678 987654321098765432\``
            });
        }

        const category = resolveCategory(args[1]);
        const role = resolveRole(args[2]);

        if (!category) {
            return message.reply({
                content: "Couldn't find a valid category. Provide its name, ID, or mention."
            });
        }

        if (!role) {
            return message.reply({
                content: "Couldn't find a valid role. Provide its name, ID, or mention."
            });
        }

        const [existing] = await db
            .select()
            .from(vcRole)
            .where(
                and(
                    eq(vcRole.guildId, message.guildId),
                    eq(vcRole.categoryId, category.id),
                    eq(vcRole.roleId, role.id)
                )
            );

        if (existing) {
            return message.reply({
                content:
                    `The role ${role} is already configured for category **${category.name}**.`
            });
        }

        await db.insert(vcRole).values({
            guildId: message.guildId,
            categoryId: category.id,
            roleId: role.id
        });

        return message.reply({
            content:
                `Successfully configured ${role} for category **${category.name}**.`
        });
    }

    // REMOVE
    if (type === "remove") {
        if (args.length !== 3) {
            return message.reply({
                content:
                    `Valid usage: \`${prefix}vcrole remove {category} {role}\`\n` +
                    `Example: \`${prefix}vcrole remove 123456789012345678 987654321098765432\``
            });
        }

        const category = resolveCategory(args[1]);
        const role = resolveRole(args[2]);

        if (!category) {
            return message.reply({
                content: "Couldn't find a valid category."
            });
        }

        if (!role) {
            return message.reply({
                content: "Couldn't find a valid role."
            });
        }

        const result = await db
            .delete(vcRole)
            .where(
                and(
                    eq(vcRole.guildId, message.guildId),
                    eq(vcRole.categoryId, category.id),
                    eq(vcRole.roleId, role.id)
                )
            )
            .returning();

        if (!result.length) {
            return message.reply({
                content:
                    `No configuration found for ${role} in category **${category.name}**.`
            });
        }

        return message.reply({
            content:
                `Successfully removed ${role} from category **${category.name}** configuration.`
        });
    }

    // LIST
    if (type === "list") {
        const results = await db
            .select()
            .from(vcRole)
            .where(eq(vcRole.guildId, message.guildId));

        if (!results.length) {
            return message.reply({
                content: "No voice category role configurations found in this server."
            });
        }

        const configurations = results.map((entry, index) => {
            const category = message.guild.channels.cache.get(entry.categoryId);
            const role = message.guild.roles.cache.get(entry.roleId);

            return (
                `**${index + 1}.** ` +
                `Category: ${category ? `**${category.name}**` : `\`${entry.categoryId}\``}\n` +
                `└ Role: ${role ? role.toString() : `\`${entry.roleId}\``
                }`
            );
        });

        return message.reply({
            content:
                `**Voice Category Role Configurations**\n\n` +
                configurations.join("\n\n")
        });
    }
};