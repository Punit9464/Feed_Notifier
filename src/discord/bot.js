import { Client, GatewayIntentBits, Partials, Collection, ChannelType } from 'discord.js'
import logger from '../utils/logger.js';
import { getDbInstance } from '../db/index.js';
import { prefixTable } from '../db/schema/prefix.js'
import { and, eq } from 'drizzle-orm';
import { readdirSync } from 'node:fs';
import { constants, env } from '../config/index.js';
import { vcRole } from '../db/schema/vcRole.js';
import { unsubscribeYouTubeChannel } from '../integrations/youtube/youtube.websub.js';

// discord client definition
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.User, Partials.Channel, Partials.GuildMember, Partials.Message],
    failIfNotExists: true,
    allowedMentions: { repliedUser: true, parse: ['everyone', 'roles', 'users'] },
    shards: "auto"
});

client.logger = logger;
client.commands = new Collection();
client.defaultPrefix = constants.DISCORD_CONSTANTS.PREFIX;

// load commands
readdirSync('./src/discord/commands').forEach(async (file) => {
    if(!file.endsWith('.js')) return;
    const command = await import('./commands/' + file);
    if(command) {
        client.commands.set(command.name, command);
    }
});

// discord client events listeners
client.on('clientReady', () => client.logger.info('Bot is Online'));
client.on('error', (err) => logger.error({ err }, 'Discord Bot Error'));
client.on('warn', (msg) => logger.info({ msg }, 'Discord Bot Warning Message'));
client.on('messageCreate', async message => {
    if(!message.guild || message.author.bot) return;
    let prefixData;
    let db = await getDbInstance();
    prefixData = await db.select({
        prefix: prefixTable.prefix
    }).from(prefixTable).where(eq(prefixTable.guildId, message.guildId));
    prefixData = prefixData[0]?.prefix ?? client.defaultPrefix;

    const mentionRegex = new RegExp(`<@${client.user.id}>`);
    const prefix = message.content.match(mentionRegex) ? message.content.match(mentionRegex)[0] : prefixData;

    if(!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const commandName = args.shift().toLowerCase();
    const command = client.commands.get(commandName) || client.commands.find(c => c.aliases && c.aliases.includes(commandName));
    if(!command) return;

    try{
        await command.run(client, message, args, prefixData);
    } catch(e) {
        logger.error({ e }, 'Error with Discord Bot Command');
    }
});
client.on('interactionCreate', async (interaction) => {
    if(interaction.isButton()) {
        if(interaction.customId === 'eval_dev_string' && interaction.member.id === '1231645547668967488' && interaction.message.deletable) {
            await interaction.message.delete();
        }
    }
});

client.on("voiceStateUpdate", async (oldState, newState) => {
    try {
        if (!oldState.guild || !newState.guild) return;

        const oldChannel = oldState.channel;
        const newChannel = newState.channel;

        // Ignore events where the user did not change voice channels
        if (oldChannel?.id === newChannel?.id) return;

        const member = newState.member ?? oldState.member;
        if (!member) return;

        const db = await getDbInstance();

        // Fetch the VC role configuration for a category
        const getCategoryConfig = async (categoryId) => {
            if (!categoryId) return null;

            const [config] = await db
                .select()
                .from(vcRole)
                .where(
                    and(
                        eq(vcRole.guildId, newState.guild.id),
                        eq(vcRole.categoryId, categoryId)
                    )
                )
                .limit(1);

            return config ?? null;
        };

        // Centralized role assignment/removal
        const updateRole = async (config, action) => {
            if (!config) return;

            const role =
                newState.guild.roles.cache.get(config.roleId) ??
                await newState.guild.roles.fetch(config.roleId);

            if (!role) {
                logger.warn(`Configured VC role ${config.roleId} not found`);
                return;
            }

            const category =
                newState.guild.channels.cache.get(config.categoryId) ??
                await newState.guild.channels.fetch(config.categoryId);

            if (!category || category.type !== ChannelType.GuildCategory) {
                logger.warn(`Configured VC category ${config.categoryId} not found`);
                return;
            }

            const hasRole = member.roles.cache.has(role.id);

            if (action === "add" && !hasRole) {
                await member.roles.add(role, "VC Roles Update");

                logger.info(
                    `Added VC Role to ${member.user.globalName ?? member.user.username} for category ${category.name}`
                );
            } else if (action === "remove" && hasRole) {
                await member.roles.remove(role, "VC Roles Update");

                logger.info(
                    `Removed VC Role from ${member.user.globalName ?? member.user.username} for category ${category.name}`
                );
            }
        };

        const oldCategoryId = oldChannel?.parentId;
        const newCategoryId = newChannel?.parentId;

        const oldConfig = await getCategoryConfig(oldCategoryId);
        const newConfig = await getCategoryConfig(newCategoryId);

        // JOIN
        if (!oldChannel && newChannel) {
            await updateRole(newConfig, "add");
        }

        // LEAVE
        else if (oldChannel && !newChannel) {
            await updateRole(oldConfig, "remove");
        }

        // SWITCH CHANNELS
        else if (oldChannel && newChannel) {
            // Same category: no role change needed
            if (oldCategoryId === newCategoryId) return;

            // Remove role from old category
            await updateRole(oldConfig, "remove");

            // Add role from new category
            await updateRole(newConfig, "add");
        }

    } catch (error) {
        logger.error(
            { error: error.message, stack: error.stack },
            "Failed to process VC role update"
        );
    }
});

const startBot = async() => {
    await getDbInstance();
    await client.login(env.botToken);
}

export default startBot;