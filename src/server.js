import express from 'express';
import kickWebhookRouter from './integrations/kick/kick.webhook.js';
import youtubeWebhookRouter from './integrations/youtube/youtube.webhook.js';
import logger from './utils/logger.js';

const app = express();
app.use("/webhooks/kick", express.raw({ type: 'application/json' }), kickWebhookRouter);
app.use("/webhooks/youtube", express.raw({ type: ["application/atom+xml", "application/xml", "text/xml"] }), youtubeWebhookRouter);

app.use(express.json());

const serverStarter = function() {
    app.listen(3000, () => logger.info("App is listening on the PORT", 3000));
}

export default serverStarter;