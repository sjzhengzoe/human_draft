import COS from "cos-nodejs-sdk-v5";
import { config } from "../config.mjs";

let client;
let testAdapter;

export function setCosStorageTestAdapter(adapter) {
  if (config.nodeEnv !== "test") {
    throw new Error("COS test adapter is only available in test mode");
  }
  testAdapter = adapter;
}

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
  if (testAdapter) return testAdapter.putObject({ key, buffer, contentType, cacheControl });
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
  if (testAdapter) return testAdapter.getObject(key);
  const data = await callCos("getObject", baseParameters(key));
  return Buffer.isBuffer(data.Body) ? data.Body : Buffer.from(data.Body || "");
}

export async function copyCosObject(sourceKey, destinationKey) {
  if (testAdapter) return testAdapter.copyObject(sourceKey, destinationKey);
  const encodedSourceKey = encodeURIComponent(sourceKey).replace(/%2F/gi, "/");
  return callCos("putObjectCopy", {
    ...baseParameters(destinationKey),
    CopySource: `${config.cosBucket}.cos.${config.cosRegion}.myqcloud.com/${encodedSourceKey}`,
    MetadataDirective: "Copy",
  });
}

export async function deleteCosObject(key) {
  if (testAdapter) return testAdapter.deleteObject(key);
  return callCos("deleteObject", baseParameters(key));
}

export function getCosSignedObjectUrl(key, expiresIn, query = {}) {
  if (testAdapter) return testAdapter.getSignedObjectUrl(key, expiresIn, query);
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
  if (testAdapter) return testAdapter.listObjects(prefix);
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
