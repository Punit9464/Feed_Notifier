import { Router } from "express";
import { verifyKickSignature } from "./kick.signature.js";
import { getDbInstance } from "../../db/index.js";
import { streamSubsTable } from "../../db/schema/streamSubs.js";
import { streamersTable } from "../../db/schema/streamer.js"
import { and, eq, sql } from "drizzle-orm";
import { WebhookClient } from "discord.js";

const router = Router();

router.post("/", async (req, res) => {
    try {
        console.log("A Data came here through webhooks");

        const messageId = req.get("Kick-Event-Message-Id");
        const subscriptionId = req.get("Kick-Event-Subscription-Id");
        const signature = req.get("Kick-Event-Signature");
        const timestamp = req.get("Kick-Event-Message-Timestamp");
        const eventType = req.get("Kick-Event-Type");
        const eventVersion = req.get("Kick-Event-Version");

        if (!Buffer.isBuffer(req.body)) {
            console.log("Buffer Empty")
            return res.status(400).send("Expected raw request body");
        }

        const rawBody = req.body;

        const isValid = await verifyKickSignature({
            messageId,
            timestamp,
            rawBody,
            signature
        });

        if (!isValid) {
            console.warn("Invalid Kick webhook signature", {
                messageId,
                eventType
            });

            return res.status(401).send("Invalid signature");
        }

        const payload = JSON.parse(rawBody.toString("utf8"));
        if (eventType === "livestream.status.updated" && payload.is_live) {
            // fetch the subs of the streamer using the streamerId on kick
            const db = await getDbInstance();
            const broadcasterId = String(payload.broadcaster.user_id);

            const subscriptions = await db
                .select({
                    guildId: streamSubsTable.guildId,
                    discordWebhookLink: streamSubsTable.discordWebhookLink
                })
                .from(streamSubsTable)
                .innerJoin(
                    streamersTable,
                    sql`${streamSubsTable.streamerId}::text = ${streamersTable.streamerId}`
                )
                .where(
                    and(
                        eq(streamersTable.platform, "kick"),
                        eq(streamersTable.streamerId, broadcasterId)
                    )
                );

            const results = await Promise.allSettled(
                subscriptions.map(async (subscription) => {
                    const webhook = new WebhookClient({
                        url: subscription.discordWebhookLink
                    });

                    try {
                        const channelURL = `https://kick.com/${payload.broadcaster.channel_slug}`;

                        // const embed = new EmbedBuilder()
                        //     .setColor("#53FC19")
                        //     .setAuthor({
                        //         name: payload.broadcaster.username,
                        //         url: channelURL,
                        //         ...(payload.broadcaster.profile_picture && {
                        //             iconURL: payload.broadcaster.profile_picture
                        //         })
                        //     })
                        //     .setTitle(payload.title || "Live on Kick")
                        //     .setURL(channelURL)
                            // .setImage(payload.thumbnail);

                        await webhook.send({
                            content: `@everyone **${payload.broadcaster.username} is LIVE on KICK, Watch here:** ${channelURL}`
                        });
                    } finally {
                        webhook.destroy();
                    }
                })
            );

            // Log failed deliveries without interrupting other notifications
            const failures = results.filter(result => result.status === "rejected");

            if (failures.length > 0) {
                console.error(
                    `${failures.length}/${subscriptions.length} Discord webhook deliveries failed:`,
                    failures.map(result => result.reason)
                );
            }
        }

        return res.sendStatus(200);
    } catch (error) {
        console.error("Kick webhook handler error:", error);
        return res.sendStatus(500);
    }
});

export default router;
