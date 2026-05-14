import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { SNSClient } from "@aws-sdk/client-sns";
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { config } from "./config";

const region = config.region;

export const ddbRaw = new DynamoDBClient({ region });
export const ddb = DynamoDBDocumentClient.from(ddbRaw, {
  marshallOptions: { removeUndefinedValues: true },
});

export const s3 = new S3Client({ region });
export const sns = new SNSClient({ region });
export const cw = new CloudWatchClient({ region });
