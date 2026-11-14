import 'dotenv/config';
import botStarter from './src/discord/bot.js';
import serverStarter from './src/server.js';

botStarter();
serverStarter();

process.on("uncaughtException", (e) => console.log(e));
process.on("unhandledRejection", (e) => console.log(e));