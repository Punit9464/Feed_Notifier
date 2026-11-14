import { and, eq } from 'drizzle-orm';
import { getDbInstance } from '../../db/index.js';
import { getChannelData, subscribeToLiveFeed } from '../../integrations/kick/kick.api.js';
import { streamersTable } from '../../db/schema/streamer.js';
import { streamSubsTable } from '../../db/schema/streamSubs.js';

export const name = 'kick-setup';
export const description = 'Setups the Kick Feed notification Service in the server';
export const aliases = ['kick-feed-setup', 'kick-feeder'];
export const run = async (client, message, args, prefix) => {
    if(!message.member.permissions.has("ManageGuild")) {
        return await message.reply({
            content: `You are missing the required permission: \`Manage Guild\``
        });
    }

    if(!args.length)
        return await message.reply({
            content: `To setup a Kick Streamer on your server, use the command like this:\n- kick-setup {slug} {channel}`
        });
    
    if(args.length < 2)
        return await message.reply({
            content: `Invalid command usage, use the command like this:\n- kick-setup {slug} {channel}`
        });

    const slug = args[0].toLowerCase();
    if(!slug) return await message.reply({
        content: `A channel slug is expected.`
    });

    const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
    if(!channel) return await message.reply({
        content: `Sorry couldn't look for that channel`
    });

    // Create a integration on that channel and store the discord webhook link of that server

    // 1. retrive the channel information
    const kickChannel = await getChannelData(slug);
    if(!kickChannel) {
        return await message.reply({
            content: 'Cannot Find any kick channel with this slug'
        });
    }

    // 2. check if this streamer is present in our streamers Table
    const db = await getDbInstance();
    let [streamer] = await db.select().from(streamersTable)
        .where(and(
            eq(streamersTable.streamerId, kickChannel.broadcaster_user_id),
            eq(streamersTable.slug, kickChannel.slug),
            eq(streamersTable.platform, 'kick')
        ));
    let alreadySubscribed = true;

    if(!streamer) {
        alreadySubscribed = false;
        [streamer] = await db.insert(streamersTable)
            .values({ streamerId: kickChannel.broadcaster_user_id, platform: 'kick', slug: kickChannel.slug }).returning({
                streamerId: streamersTable.streamerId,
                platform: streamersTable.platform,
                slug: streamersTable.slug
            });
    }

    // // 3. Check if this server already has a stream subscription with this kick streamer
    let [subRes] = await db.select().from(streamSubsTable)
        .where(and(
            eq(streamSubsTable.guildId, message.guildId),
            eq(streamSubsTable.streamerId, streamer.streamerId),
        ));

    if(subRes) {
        return await message.reply({ content: 'That Streamer is already subscribed in this server.' });
    }
    try{
        const { url: webhookUrl } = await channel.createWebhook({ name: streamer.slug });

        await db.insert(streamSubsTable).values({
            streamerId: streamer.streamerId,
            guildId: message.guildId,
            discordWebhookLink: webhookUrl
        }).onConflictDoNothing();

        if(!alreadySubscribed) {
            const d = await subscribeToLiveFeed(streamer.streamerId);
            console.log(d);
        }

        await message.reply({
            content: `Successfully Subscribed to \*${streamer.slug}\*\n**Note:** We have created a discord integration on the mentioned channel ${channel}, please make sure that integration doesn't gets removed by your security-system.`
        });
    } catch(e) {
        console.log(e);
        return await message.reply({
            content: `Couldn't create a discord integration on the channel: ${channel}, Please make sure I have the required permissions on that channel to create a webhook there.`
        });
    }
};