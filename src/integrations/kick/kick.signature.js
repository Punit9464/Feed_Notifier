import { createVerify } from "node:crypto";

const publicKeyURL = "https://api.kick.com/public/v1/public-key";
let cachedPublicKey = null;

async function getKickPublicKey() {
    const response = await fetch(publicKeyURL);

    if (!response.ok) {
        throw new Error(
            `Failed to fetch Kick public key: ${response.status}`
        );
    }

    const { data } = await response.json();

    if (!data?.public_key) {
        throw new Error("Kick public key missing from response");
    }

    cachedPublicKey = data.public_key;

    return cachedPublicKey;
}

async function verifyKickSignature({ messageId, timestamp, rawBody, signature }) {
    if (!messageId || !timestamp || !rawBody || !signature) {
        return false;
    }

    const publicKey = await getKickPublicKey();
    const signedPayload = `${messageId}.${timestamp}.${rawBody}`;
    const verifier = createVerify("RSA-SHA256");

    verifier.update(signedPayload);
    verifier.end();

    return verifier.verify(
        publicKey,
        signature,
        "base64"
    );
}

export {
    getKickPublicKey,
    verifyKickSignature
};
