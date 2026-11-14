
const HUB_URL = "https://pubsubhubbub.appspot.com/subscribe";

function getYouTubeTopicUrl(channelId) {
    return `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

function getYouTubeCallbackUrl() {
    const baseUrl = process.env.PUBLIC_BASE_URL;

    if (!baseUrl) {
        throw new Error("PUBLIC_BASE_URL is not configured");
    }

    return new URL("/webhooks/youtube", baseUrl).toString();
}

export async function subscribeToChannel(channelId) {
    const callbackUrl = getYouTubeCallbackUrl();
    const topicUrl = getYouTubeTopicUrl(channelId);

    const body = new URLSearchParams({
        "hub.callback": callbackUrl,
        "hub.mode": "subscribe",
        "hub.topic": topicUrl,
        "hub.verify": "async",
        "hub.lease_seconds": "864000",
    });

    const response = await fetch(HUB_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
    });

    if (!response.ok) {
        const responseText = await response.text();

        throw new Error(
            `YouTube WebSub subscription failed (${response.status}): ${responseText}`
        );
    }

    return {
        channelId,
        topicUrl,
        callbackUrl,
        status: response.status,
    };
}

export async function unsubscribeYouTubeChannel(channelId, callbackUrl = null) {
    const resolvedCallbackUrl = callbackUrl ?? getYouTubeCallbackUrl();
    const topicUrl = getYouTubeTopicUrl(channelId);

    const body = new URLSearchParams({
        "hub.callback": resolvedCallbackUrl,
        "hub.mode": "unsubscribe",
        "hub.topic": topicUrl,
        "hub.verify": "async",
    });

    const response = await fetch(HUB_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
    });

    if (!response.ok) {
        const responseText = await response.text();

        throw new Error(
            `YouTube WebSub unsubscription failed (${response.status}): ${responseText}`
        );
    }

    return {
        channelId,
        topicUrl,
        callbackUrl: resolvedCallbackUrl,
        status: response.status,
    };
}
