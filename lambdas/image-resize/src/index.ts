import { S3Event } from "aws-lambda";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import sharp from "sharp";

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const RESIZED_BUCKET = process.env.S3_RESIZED_BUCKET!;
const TASKS_TABLE = process.env.DDB_TASKS_TABLE ?? "Tasks";

export const handler = async (event: S3Event): Promise<void> => {
  for (const record of event.Records) {
    const srcBucket = record.s3.bucket.name;
    const srcKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    // Only process originals — guard against infinite loops if buckets overlap
    if (!srcKey.includes("/originals/")) {
      console.log(`Skipping non-original key: ${srcKey}`);
      continue;
    }

    console.log(`Resizing: s3://${srcBucket}/${srcKey}`);

    // Fetch original
    const { Body } = await s3.send(
      new GetObjectCommand({ Bucket: srcBucket, Key: srcKey })
    );
    if (!Body) throw new Error(`Empty body for key: ${srcKey}`);
    const buffer = Buffer.from(await Body.transformToByteArray());

    // Resize to 300×300 max, preserve aspect ratio, output JPEG
    const resized = await sharp(buffer)
      .resize(300, 300, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    // Write thumbnail — same path structure, swap /originals/ → /thumbnails/
    const thumbnailKey = srcKey.replace("/originals/", "/thumbnails/");
    await s3.send(
      new PutObjectCommand({
        Bucket: RESIZED_BUCKET,
        Key: thumbnailKey,
        Body: resized,
        ContentType: "image/jpeg",
      })
    );
    console.log(`Thumbnail written: s3://${RESIZED_BUCKET}/${thumbnailKey}`);

    // Update the task's thumbnailKey in DynamoDB
    // srcKey pattern: tasks/<taskId>/originals/<filename>
    const taskId = srcKey.split("/")[1];
    if (taskId) {
      await updateTaskThumbnail(taskId, thumbnailKey);
    }
  }
};

async function updateTaskThumbnail(taskId: string, thumbnailKey: string) {
  // Tasks PK=taskId SK=projectId — we need the projectId to do a direct update.
  // Query via scan with filter (small table during demo; production would use a GSI).
  const { Items } = await dynamo.send(
    new ScanCommand({
      TableName: TASKS_TABLE,
      FilterExpression: "taskId = :id",
      ExpressionAttributeValues: { ":id": taskId },
      Limit: 1,
    })
  );

  if (!Items?.length) {
    console.warn(`Task ${taskId} not found — skipping thumbnailKey update`);
    return;
  }

  const task = Items[0];
  await dynamo.send(
    new UpdateCommand({
      TableName: TASKS_TABLE,
      Key: { taskId: task.taskId, projectId: task.projectId },
      UpdateExpression: "SET thumbnailKey = :t, updatedAt = :u",
      ExpressionAttributeValues: {
        ":t": thumbnailKey,
        ":u": new Date().toISOString(),
      },
    })
  );
  console.log(`Updated task ${taskId} thumbnailKey → ${thumbnailKey}`);
}
