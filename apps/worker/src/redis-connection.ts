import IORedis from "ioredis";

export function createWorkerRedisConnection(redisUrl: string): IORedis {
  const connection = new IORedis(redisUrl, {
    connectionName: "medvault-worker",
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
    connectTimeout: 5_000,
    retryStrategy(attempt) {
      return Math.min(250 * attempt, 5_000);
    },
  });
  connection.on("ready", () => {
    process.stdout.write("MedVault worker Redis ready\n");
  });
  connection.on("reconnecting", () => {
    process.stderr.write("MedVault worker Redis reconnecting\n");
  });
  connection.on("error", () => {
    process.stderr.write("MedVault worker Redis error\n");
  });
  return connection;
}

export async function closeWorkerRedisConnection(connection: IORedis): Promise<void> {
  try {
    await connection.quit();
  } catch {
    connection.disconnect();
  }
}
