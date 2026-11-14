import { Router } from "express";
import { XMLParser } from "fast-xml-parser";
import { getVideoData } from "./youtube.api.js";
import { dispatchYouTubeNotification } from "./youtube.dispatcher.js";
import { getDbInstance } from "../../db/index.js";
import { streamersTable } from "../../db/schema/streamer.js";
import { and, eq, inArray } from "drizzle-orm";
import logger from "../../utils/logger.js";

const router = Router();

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
});

const YOUTUBE_FEED_HOST = "www.youtube.com";
const YOUTUBE_FEED_PATH = "/xml/feeds/videos.xml";

const YOUTUBE_PLATFORM_VALUES = ["youtube-live", "youtube-videos"];

function resolveNotificationPlatform(video) {
    const liveBroadcastContent = video?.snippet?.liveBroadcastContent;

    if (liveBroadcastContent === "live" || liveBroadcastContent === "upcoming") {
        return "youtube-live";
    }

    return "youtube-videos";
}

/**
 * Extract channelId from a valid YouTube WebSub topic URL.
 */
function extractChannelIdFromTopic(topic) {
    try {
        const url = new URL(topic);

        if (
            url.protocol !== "https:" ||
            url.hostname !== YOUTUBE_FEED_HOST ||
            url.pathname !== YOUTUBE_FEED_PATH
        ) {
            return null;
        }

        return url.searchParams.get("channel_id");
    } catch {
        return null;
    }
}

/**
 * Check whether a YouTube channel is registered in our database.
 */
async function isRegisteredYouTubeChannel(channelId) {
    if (!channelId) return false;

    const db = await getDbInstance();

    const [streamer] = await db
        .select({
            streamerId: streamersTable.streamerId,
        })
        .from(streamersTable)
        .where(
            and(
                eq(streamersTable.streamerId, channelId),
                // YouTube channels may be subscribed as either livestreams or uploads.
                // Verification should accept either platform variant and still reject
                // unrelated channels.
                inArray(streamersTable.platform, YOUTUBE_PLATFORM_VALUES)
            )
        )
        .limit(1);

    return Boolean(streamer);
}

/**
 * WebSub subscription/unsubscription verification.
 */
router.get("/", async (req, res) => {
    try {
        const mode = req.query["hub.mode"];
        const topic = req.query["hub.topic"];
        const challenge = req.query["hub.challenge"];

        const channelId = extractChannelIdFromTopic(topic);

        if (
            !["subscribe", "unsubscribe"].includes(mode) ||
            !challenge ||
            !channelId
        ) {
            logger.warn(
                { mode, topic },
                "Invalid YouTube WebSub verification request"
            );

            return res.sendStatus(403);
        }

        const isRegistered = await isRegisteredYouTubeChannel(channelId);

        if (!isRegistered) {
            logger.warn(
                { channelId, topic },
                "WebSub verification rejected: YouTube channel is not registered"
            );

            return res.sendStatus(403);
        }

        logger.info(
            { channelId, mode, topic },
            "YouTube WebSub subscription verified"
        );

        return res
            .status(200)
            .type("text/plain")
            .send(challenge);
    } catch (error) {
        logger.error(
            { error: error.message },
            "YouTube WebSub verification error"
        );

        return res.sendStatus(500);
    }
});

/**
 * Incoming YouTube Atom feed notification.
 */
router.post("/", async (req, res) => {
    try {
        if (!Buffer.isBuffer(req.body)) {
            logger.warn("YouTube webhook received a non-raw request body");
            return res.sendStatus(400);
        }

        const xml = req.body.toString("utf8");
        const parsed = parser.parse(xml);

        let entries = parsed.feed?.entry ?? [];

        if (!Array.isArray(entries)) {
            entries = entries ? [entries] : [];
        }

        logger.info(
            { entryCount: entries.length },
            "YouTube WebSub POST received"
        );

        for (const entry of entries) {
            const channelId = entry["yt:channelId"];
            const videoId = entry["yt:videoId"];

            if (!channelId || !videoId) {
                logger.warn(
                    { entry },
                    "Invalid YouTube feed entry received"
                );
                continue;
            }

            try {
                const isRegistered =
                    await isRegisteredYouTubeChannel(channelId);

                if (!isRegistered) {
                    logger.warn(
                        { channelId, videoId },
                        "Ignoring notification for an unregistered YouTube channel"
                    );
                    continue;
                }

                const video = await getVideoData(videoId);

                // Ensure the API metadata belongs to the same channel
                // as the incoming WebSub feed entry.
                if (video.snippet.channelId !== channelId) {
                    logger.warn(
                        {
                            feedChannelId: channelId,
                            videoChannelId: video.snippet.channelId,
                            videoId,
                        },
                        "YouTube feed entry channel mismatch"
                    );
                    continue;
                }

                logger.info(
                    {
                        videoId: video.id,
                        title: video.snippet.title,
                        channelId: video.snippet.channelId,
                        channelTitle: video.snippet.channelTitle,
                        thumbnail: video.snippet.thumbnails?.high?.url,
                        liveBroadcastContent:
                            video.snippet.liveBroadcastContent,
                        liveStreamingDetails:
                            video.liveStreamingDetails,
                    },
                    "YouTube video metadata fetched successfully"
                );

                await dispatchYouTubeNotification(video);
            } catch (error) {
                logger.error(
                    {
                        videoId,
                        channelId,
                        error: error.message,
                    },
                    "Failed to process YouTube notification"
                );
            }
        }

        return res.sendStatus(204);
    } catch (error) {
        logger.error(
            { error: error.message },
            "YouTube webhook handler error"
        );

        return res.sendStatus(500);
    }
});

export default router;
