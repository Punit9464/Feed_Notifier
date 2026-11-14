import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    WebhookClient,
} from "discord.js";

import { getDbInstance } from "../../db/index.js";
import { streamSubsTable } from "../../db/schema/streamSubs.js";
import { streamersTable } from "../../db/schema/streamer.js";
import { and, eq } from "drizzle-orm";
import logger from "../../utils/logger.js";

export async function dispatchYouTubeNotification(video, notificationPlatform = null) {
    const channelId = video.snippet.channelId;
    const videoId = video.id;
    const videoTitle = video.snippet.title;
    const channelTitle = video.snippet.channelTitle;

    const videoURL = `https://www.youtube.com/watch?v=${videoId}`;
    const channelURL = `https://www.youtube.com/channel/${channelId}`;

    const liveStatus = video.snippet.liveBroadcastContent;

    const isLive = liveStatus === "live";
    const isUpcoming = liveStatus === "upcoming";
    const isLivestream = Boolean(video.liveStreamingDetails);

    const resolvedPlatform = isLive
    ? "youtube-live"
    : "youtube-videos";

    // A video with liveStreamingDetails is associated with a livestream,
    // including scheduled or completed livestreams.

    // Only live-now events and regular uploads should be dispatched.
    // Only live-now events and regular uploads should be dispatched.
    if (isUpcoming) {
        logger.info(
            { videoId, channelId },
            "Ignoring scheduled YouTube livestream notification"
        );
        return;
    }

    if (!isLive && isLivestream) {
        logger.info(
            { videoId, channelId, liveStatus },
            "Ignoring non-live livestream event from uploads dispatcher"
        );
        return;
    }

    const db = await getDbInstance();

    // Find all Discord guilds subscribed to this YouTube channel.
    const subscriptions = await db
        .select({
            guildId: streamSubsTable.guildId,
            discordWebhookLink: streamSubsTable.discordWebhookLink,
        })
        .from(streamSubsTable)
        .innerJoin(
            streamersTable,
            eq(streamSubsTable.streamerId, streamersTable.id)
        )
        .where(
            and(
                eq(streamersTable.platform, resolvedPlatform),
                eq(streamersTable.streamerId, channelId)
            )
        );

    if (subscriptions.length === 0) {
        logger.info(
            { channelId, channelTitle },
            "No Discord guilds subscribed to this YouTube channel"
        );

        return;
    }
    let messageContent;
    let notificationTitle;

    if (isLive) {
        notificationTitle = "🔴 LIVE NOW";
        messageContent = `@everyone 🔴 ${channelTitle} is LIVE now!`;
    } else if (isUpcoming) {
        notificationTitle = "🔔 UPCOMING LIVESTREAM";
        messageContent = `🔔 ${channelTitle} has scheduled a livestream! @everyone`;
    } else {
        notificationTitle = "📹 NEW VIDEO";
        messageContent = `📹 ${channelTitle} uploaded a new video! @everyone`;
    }

    logger.info({
        video
    }, "This is the Video Content");

    const embed = new EmbedBuilder()
        .setColor("#fa0c28")
        .setTitle(
            `🔴 PHANTOMS ${isLive ? "LIVE BROADCAST" : "PUBLISHED A NEW VIDEO"}`
        )
        .setDescription(
            `**${isLive ? `${channelTitle} is LIVE!` : `${channelTitle} uploaded a new video!`}**\n` +
            `${videoTitle}\n` +
            `📺 **Platform:** YouTube`
        )
        .setURL(videoURL)
        .setImage(
            video.snippet.thumbnails?.high?.url ??
            video.snippet.thumbnails?.medium?.url ??
            video.snippet.thumbnails?.default?.url
        )
        .setFooter({
            text: "Phantoms Community",
        });

    const actionRow = new ActionRowBuilder().addComponents([
        new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel("Watch on YouTube")
            .setEmoji("▶️")
            .setURL(videoURL)
    ]);

    const results = await Promise.allSettled(
        subscriptions.map(async (subscription) => {
            const webhook = new WebhookClient({
                url: subscription.discordWebhookLink,
            });

            try {
                await webhook.send({
                    content: messageContent,
                    embeds: [embed],
                    components: [actionRow],
                    allowedMentions: {
                        parse: ["everyone"],
                    },
                });
            } finally {
                webhook.destroy();
            }
        })
    );

    const failures = results.filter(
        (result) => result.status === "rejected"
    );

    logger.info(
        {
            videoId,
            channelId,
            totalSubscriptions: subscriptions.length,
            successfulDeliveries: subscriptions.length - failures.length,
            failedDeliveries: failures.length,
        },
        "YouTube notification dispatch completed"
    );

    if (failures.length > 0) {
        logger.error(
            {
                videoId,
                failures: failures.map((result) => ({
                    error: result.reason?.message ?? String(result.reason),
                })),
            },
            "Some YouTube Discord webhook deliveries failed"
        );
    }
}
