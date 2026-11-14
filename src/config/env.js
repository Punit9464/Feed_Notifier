import 'dotenv/config';

const env = {
    port: process.env.PORT,
    botToken: process.env.DISCORD_BOT_TOKEN,
    dbUrl: process.env.DB_URL,
    pasteBinDevKey: process.env.PASTE_BIN_KEY,
    kickClientId: process.env.KICK_CLIENT_ID,
    kickClientSecret: process.env.KICK_CLIENT_SECRET,
    youtubeKey: process.env.YOUTUBE_API_KEY
};

export default env;