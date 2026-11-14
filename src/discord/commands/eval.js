import { inspect } from 'util';
import { env } from '../../config/index.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const name = 'eval';
export const description = 'Tumhara koi lena dena nahi iss command se';
export const aliases = ['dev-run', 'exec'];

export const run = async (client, message, args, prefix) => {
    if(message.author.id !== '1231645547668967488')
        return;

    if(!args.length)
        return await message.reply({
            content: 'Give me something to eval.'    
        });

    let res;
    try {
        res = await eval(args.join(" "));
        res = inspect(res, { depth: 0 });
    } catch(e) {
        res = inspect(e, { depth: 0 });
    }


    try {
        return await message.reply({
            content: `\`\`\`js\n${res}\`\`\``,
            components: [
                new ActionRowBuilder()
                    .addComponents([
                        new ButtonBuilder()
                            .setCustomId('eval_dev_string')  
                            .setLabel('Delete')
                            .setStyle(ButtonStyle.Danger)
                            .setDisabled(false)
                    ])
            ]
        });
    } catch(e) {
        // Error due to content length
        const pasteRes = await fetch('https://pastebin.com/api/api_post.php', {
            method: 'POST',
            body: new URLSearchParams({
                api_dev_key: env.pasteBinDevKey,
                api_option: 'paste',
                api_paste_code: `${res}`,
                api_paste_format: 'javascript',
                api_paste_expire_date: '1D'
            })
        });
        const paste = await pasteRes.text();
        if(!pasteRes.ok) {
            return;
        }

        return await message.author.send({
            content: `${paste}`
        });
    }
};