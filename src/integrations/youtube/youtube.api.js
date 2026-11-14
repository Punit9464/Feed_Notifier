
const BASE_URL = "https://www.googleapis.com/youtube/v3";

async function youtubeRequest(endpoint, params) {
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
        throw new Error("YOUTUBE_API_KEY is not configured");
    }

    const url = new URL(`${BASE_URL}/${endpoint}`);

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            url.searchParams.set(key, value);
        }
    }

    url.searchParams.set("key", apiKey);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            `YouTube API error (${response.status}): ${JSON.stringify(data)}`
        );
    }

    return data;
}

export async function getChannelData(handle) {
    const normalizedHandle = typeof handle === "string" ? handle.trim() : "";

    if (!normalizedHandle) {
        throw new Error("YouTube channel identifier is required");
    }

    const isChannelId = /^UC[\w-]{10,}$/.test(normalizedHandle);
    const data = await youtubeRequest("channels", {
        part: "snippet,contentDetails",
        ...(isChannelId
            ? { id: normalizedHandle }
            : { forHandle: normalizedHandle.startsWith("@") ? normalizedHandle : `@${normalizedHandle}` })
    });

    const channel = data.items?.[0];

    if (!channel) {
        throw new Error(`YouTube channel not found: ${handle}`);
    }

    return {
        channelId: channel.id,
        title: channel.snippet.title,
        handle: channel.snippet.customUrl ?? channel.snippet.title,
        thumbnail: channel.snippet.thumbnails?.high?.url,
        uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads
    };
}

export async function getVideoData(videoId) {
  const data = await youtubeRequest("videos", {
    part: "snippet,liveStreamingDetails",
    id: videoId,
  });

  const video = data.items?.[0];

  if (!video) {
    throw new Error(`YouTube video not found: ${videoId}`);
  }

  return video;
}
