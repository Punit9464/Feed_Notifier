
import { and, eq, inArray } from "drizzle-orm";
import { getDbInstance } from "../../db/index.js";
import { streamersTable } from "../../db/schema/streamer.js";
import { streamSubsTable } from "../../db/schema/streamSubs.js";
import { getChannelData } from "../../integrations/youtube/youtube.api.js";
import { subscribeToChannel } from "../../integrations/youtube/youtube.websub.js";
import logger from "../../utils/logger.js";

const YOUTUBE_PLATFORMS = ["youtube-live", "youtube-videos"];

export const name = "youtube-setup";
export const description = "Sets up YouTube video or livestream notifications";
export const aliases = ["youtube-feed-setup", "youtube-feeder", "yt-setup"];

export const run = async (client, message, args, prefix) => {
    if (!message.member.permissions.has("ManageGuild")) {
        return message.reply({
            content: "You are missing the required permission: `Manage Guild`",
        });
    }

    if (args.length < 3) {
        return message.reply({
            content:
                `Invalid command usage.\n` +
                `Use:\n` +
                `- ${prefix}youtube-setup <handle> <live|videos> <channel>\n\n` +
                `Examples:\n` +
                `- ${prefix}youtube-setup @punitkumar1601 live #live-alerts\n` +
                `- ${prefix}youtube-setup @punitkumar1601 videos #youtube-uploads`,
        });
    }

    const handle = args[0].trim();
    const type = args[1].toLowerCase();

    if (!["live", "videos"].includes(type)) {
        return message.reply({
            content:
                "Invalid notification type. Use `live` for livestreams or `videos` for uploads.",
        });
    }

    const platform = type === "live" ? "youtube-live" : "youtube-videos";

    const channel =
        message.mentions.channels.first() ||
        message.guild.channels.cache.get(args[2]);

    if (!channel) {
        return message.reply({
            content: "Sorry, couldn't find that Discord channel.",
        });
    }

    try {
        // 1. Fetch YouTube channel information
        const youtubeChannel = await getChannelData(handle);

        if (!youtubeChannel?.channelId) {
            return message.reply({
                content: "Cannot find a YouTube channel with that handle.",
            });
        }

        const db = await getDbInstance();
        const channelId = youtubeChannel.channelId;

        // 2. Check if the YouTube channel is already registered
        // under either notification platform.
        // WebSub subscriptions are channel-based, not type-based.
        const [existingYouTubeChannel] = await db
            .select({
                id: streamersTable.id,
                platform: streamersTable.platform,
            })
            .from(streamersTable)
            .where(
                and(
                    eq(streamersTable.streamerId, channelId),
                    inArray(streamersTable.platform, YOUTUBE_PLATFORMS)
                )
            )
            .limit(1);

        const isWebSubAlreadyRegistered = Boolean(existingYouTubeChannel);

        // 3. Check if this channel/type combination already exists
        let [streamer] = await db
            .select()
            .from(streamersTable)
            .where(
                and(
                    eq(streamersTable.streamerId, channelId),
                    eq(streamersTable.platform, platform)
                )
            )
            .limit(1);

        // 4. Register the streamer/type if not present
        if (!streamer) {
            [streamer] = await db
                .insert(streamersTable)
                .values({
                    streamerId: channelId,
                    slug: youtubeChannel.handle || handle,
                    platform,
                })
                .returning()
                .onConflictDoNothing();
        }

        // 5. Check if this guild is already subscribed
        const [existingSubscription] = await db
            .select()
            .from(streamSubsTable)
            .where(
                and(
                    eq(streamSubsTable.guildId, message.guildId),
                    eq(streamSubsTable.streamerId, streamer.id)
                )
            )
            .limit(1);

        if (existingSubscription) {
            return message.reply({
                content:
                    `This YouTube ${type === "live" ? "livestream" : "video upload"} ` +
                    `notification is already configured in this server.`,
            });
        }

        // 6. Create a Discord webhook for the selected channel
        const { url: webhookUrl } = await channel.createWebhook({
            name: `YouTube ${type === "live" ? "Live" : "Uploads"} - ${youtubeChannel.title}`,
        });

        // 7. Store the guild subscription
        await db
            .insert(streamSubsTable)
            .values({
                streamerId: streamer.id,
                guildId: message.guildId,
                discordWebhookLink: webhookUrl,
            })
            .onConflictDoNothing();

        // 8. Subscribe to WebSub only if the YouTube channel
        // has not already been registered in the database.
        if (!isWebSubAlreadyRegistered) {
            const subscriptionResult = await subscribeToChannel(channelId);

            logger.info(
                { channelId, subscriptionResult },
                "YouTube WebSub subscription initiated"
            );
        } else {
            logger.info(
                {
                    channelId,
                    existingPlatform: existingYouTubeChannel.platform,
                },
                "YouTube channel already registered; skipping WebSub subscription"
            );
        }

        return message.reply({
            content:
                `Successfully subscribed to YouTube **${type === "live" ? "livestreams" : "video uploads"}** ` +
                `for **${youtubeChannel.title}**.\n\n` +
                `Channel: ${channel}\n` +
                `Handle: \`${youtubeChannel.handle || handle}\`\n` +
                `Notification type: \`${platform}\`\n\n` +
                `A Discord webhook has been created in ${channel}. ` +
                `Please ensure it is not removed by your server's security system.`,
        });
    } catch (error) {
        logger.error(
            { error: error.message },
            "YouTube setup error"
        );

        return message.reply({
            content:
                "Couldn't complete the YouTube setup. Please ensure I have the required permissions to create a webhook in that channel.",
        });
    }
};
