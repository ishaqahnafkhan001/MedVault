import IORedis from "ioredis";

export type RedisPurpose = "queue-producer" | "rate-limit";

export function createApiRedisConnection(redisUrl: string, purpose: RedisPurpose): IORedis {
  const queueConnection = purpose === "queue-producer";
  const connection = new IORedis(redisUrl, {
    connectionName: `medvault-api-${purpose}`,
    enableReadyCheck: true,
    maxRetriesPerRequest: queueConnection ? null : 1,
    connectTimeout: 5_000,
    retryStrategy(attempt) {
      return Math.min(250 * attempt, 5_000);
    },
  });

  connection.on("ready", () => {
    process.stdout.write(`MedVault API Redis ready: purpose=${purpose}\n`);
  });
  connection.on("reconnecting", () => {
    process.stderr.write(`MedVault API Redis reconnecting: purpose=${purpose}\n`);
  });
  connection.on("error", () => {
    process.stderr.write(`MedVault API Redis error: purpose=${purpose}\n`);
  });
  return connection;
}

export async function closeRedisConnection(connection: IORedis): Promise<void> {
  try {
    await connection.quit();
  } catch {
    connection.disconnect();
  }
}
