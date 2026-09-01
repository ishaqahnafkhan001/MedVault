import { createHash } from "node:crypto";
import type { Options, Store } from "express-rate-limit";
import type IORedis from "ioredis";
import { AppError } from "../errors.js";
import { closeRedisConnection, createApiRedisConnection } from "./redis-connection.js";

const incrementScript = `
local count = redis.call("INCR", KEYS[1])
local ttl = redis.call("PTTL", KEYS[1])
if count == 1 or ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

const decrementScript = `
local count = redis.call("GET", KEYS[1])
if not count then return 0 end
count = redis.call("DECR", KEYS[1])
if count <= 0 then redis.call("DEL", KEYS[1]) end
return count
`;

export interface RedisRateLimitClient {
  eval(script: string, numberOfKeys: number, ...arguments_: string[]): Promise<unknown>;
  del(key: string): Promise<number>;
}

export class RedisRateLimitStore implements Store {
  readonly localKeys = false;
  readonly prefix: string;
  private windowMs = 60_000;

  constructor(
    private readonly client: RedisRateLimitClient,
    prefix = "medvault:rate-limit:",
  ) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    let result: unknown;
    try {
      result = await this.client.eval(
        incrementScript,
        1,
        this.redisKey(key),
        String(this.windowMs),
      );
    } catch {
      throw new AppError(
        503,
        "RATE_LIMIT_UNAVAILABLE",
        "Request limiting is temporarily unavailable.",
      );
    }
    if (!Array.isArray(result) || result.length < 2) {
      throw new Error("Redis rate limiter returned an invalid response");
    }
    const totalHits = Number(result[0]);
    const ttlMs = Number(result[1]);
    if (!Number.isInteger(totalHits) || totalHits < 1 || !Number.isFinite(ttlMs)) {
      throw new Error("Redis rate limiter returned an invalid counter");
    }
    return { totalHits, resetTime: new Date(Date.now() + Math.max(0, ttlMs)) };
  }

  async decrement(key: string): Promise<void> {
    await this.client.eval(decrementScript, 1, this.redisKey(key));
  }

  async resetKey(key: string): Promise<void> {
    await this.client.del(this.redisKey(key));
  }

  private redisKey(key: string): string {
    const digest = createHash("sha256").update(key).digest("hex");
    return `${this.prefix}${digest}`;
  }
}

export class ManagedRedisRateLimitStore extends RedisRateLimitStore {
  constructor(private readonly connection: IORedis) {
    super(connection);
  }

  async shutdown(): Promise<void> {
    await closeRedisConnection(this.connection);
  }
}

export function createRedisRateLimitStore(redisUrl: string): ManagedRedisRateLimitStore {
  return new ManagedRedisRateLimitStore(createApiRedisConnection(redisUrl, "rate-limit"));
}
