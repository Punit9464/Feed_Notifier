export const name = 'ping';
export const aliases = ['latency']
export const description = 'Shows the latency of the bot with Discord APIs'
export const run = async (client, message, args, prefix) => {
    return await message.reply({
        content: `Bot Current Latency is: \`${client.ws.ping}\` ms.`
    });
}