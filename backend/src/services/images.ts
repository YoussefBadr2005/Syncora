import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../aws";
import { config } from "../config";

export async function getUploadUrl(taskId: string, filename: string, contentType = "image/jpeg") {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `tasks/${taskId}/originals/${Date.now()}-${safeName}`;
  const cmd = new PutObjectCommand({
    Bucket: config.s3.originalsBucket,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(s3, cmd, { expiresIn: 300 });
  return { url, key };
}

export async function getDownloadUrl(bucket: string, key: string, expiresIn = 900) {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn });
}

export async function deleteObject(bucket: string, key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
