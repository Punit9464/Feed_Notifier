import { env, constants } from "../../config/index.js";
import logger from '../../utils/logger.js';

let kickAccessToken = null;
let expiredAt = 0;

const baseAuthURL = 'https://id.kick.com/';
const baseURL = 'https://api.kick.com/';

const clientId = env.kickClientId;
const clientSecret = env.kickClientSecret;

async function refreshToken() {
    const url = baseAuthURL + 'oauth/token';
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    };
    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials'
    });
    const method = 'POST';

    const response = await fetch(url, {
        method, body, headers
    });

    const data = await response.json();
    if(!response.ok)
        throw JSON.stringify(data)

    kickAccessToken = data.access_token;
    expiredAt = Date.now() + data.expires_in * 1000;
}

function tokenExpired() {
    const buffer = constants.TOKEN_TIME_BUFFER;
    return Date.now() >= expiredAt - buffer;
}

async function getToken() {
    if(!kickAccessToken || tokenExpired())
        await refreshToken();
    return kickAccessToken;
}

async function getChannelData(slug) {
    const token = await getToken();

    const url = baseURL + 'public/v1/channels' + '?slug=' + slug;
    const method = 'GET';
    const headers = {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
    };
    const response = await fetch(url, { method, headers });

    const { data } = await response.json();
    return response.ok ? data[0] : null;
}

async function subscribeToLiveFeed(streamerId) {
    const token = await getToken();
    const url = baseURL + 'public/v1/events/subscriptions';

    const body = {
        broadcaster_user_id: Number(streamerId),
        events: [{
            "name": 'livestream.status.updated',
            "version": 1
        }],
        method: 'webhook'
    };

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();
    if(!response.ok) {
        console.log(data);
        throw new Error("Kick Subscription Failed");
    }

    return data;
}

export {
    getChannelData,
    subscribeToLiveFeed
};