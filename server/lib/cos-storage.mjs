import COS from "cos-nodejs-sdk-v5";
import { config } from "../config.mjs";

let client;

function getClient() {
  if (!client) {
    client = new COS({
      SecretId: config.cosSecretId,
      SecretKey: config.cosSecretKey,
    });
  }
  return client;
}

function callCos(method, parameters) {
  return new Promise((resolve, reject) => {
    getClient()[method](parameters, (error, data) => {
      if (error) reject(error);
      else resolve(data || {});
    });
  });
}

function baseParameters(key) {
  return {
    Bucket: config.cosBucket,
    Region: config.cosRegion,
    Key: key,
  };
}

export function cosObjectKey(bucketName, path) {
  const normalizedBucket = String(bucketName || "").replace(/^\/+|\/+$/g, "");
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  return `${normalizedBucket}/${normalizedPath}`;
}

export async function putCosObject({ key, buffer, contentType, cacheControl }) {
  return callCos("putObject", {
    ...baseParameters(key),
    Body: buffer,
    ContentLength: buffer.length,
    ContentType: contentType,
    CacheControl: cacheControl,
    StorageClass: "STANDARD",
  });
}

export async function getCosObject(key) {
  const data = await callCos("getObject", baseParameters(key));
  return Buffer.isBuffer(data.Body) ? data.Body : Buffer.from(data.Body || "");
}

export async function deleteCosObject(key) {
  return callCos("deleteObject", baseParameters(key));
}

export async function copyCosObject(sourceKey, destinationKey, metadata = {}) {
  const buffer = await getCosObject(sourceKey);
  return putCosObject({
    key: destinationKey,
    buffer,
    contentType: metadata.contentType || "image/webp",
    cacheControl: metadata.cacheControl || "3600",
  });
}

export function getCosSignedObjectUrl(key, expiresIn, query = {}) {
  return new Promise((resolve, reject) => {
    getClient().getObjectUrl(
      {
        ...baseParameters(key),
        Sign: true,
        Protocol: "https:",
        Domain: config.cosImageDomain || undefined,
        Expires: expiresIn,
        Query: {
          "response-content-disposition": "inline",
          ...query,
        },
      },
      (error, data) => {
        if (error) reject(error);
        else resolve(data?.Url || "");
      },
    );
  });
}

export async function listCosObjects(prefix = "") {
  const objects = [];
  let marker = "";
  do {
    const data = await callCos("getBucket", {
      Bucket: config.cosBucket,
      Region: config.cosRegion,
      Prefix: prefix,
      Marker: marker || undefined,
      MaxKeys: 1000,
    });
    objects.push(...(data.Contents || []));
    marker = data.IsTruncated === "true" ? data.NextMarker || "" : "";
  } while (marker);
  return objects;
}
