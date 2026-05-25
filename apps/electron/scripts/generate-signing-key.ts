import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

console.log("TENSAMIN_UPDATE_PRIVATE_KEY_PEM=");
console.log(privateKey.trim());
console.log("\nTENSAMIN_UPDATE_PUBLIC_KEY_PEM=");
console.log(publicKey.trim());
