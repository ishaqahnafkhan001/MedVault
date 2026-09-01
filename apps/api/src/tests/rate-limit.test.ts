import express from "express";
import rateLimit, { type Options, type Store } from "express-rate-limit";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { RedisRateLimitStore, type RedisRateLimitClient } from "../services/rate-limit.js";

describe("rate limiting", () => {
  it("shares counters across API instances without storing the raw client key", async () => {
    const client = new FakeRedisClient();
    const first = new RedisRateLimitStore(client);
    const second = new RedisRateLimitStore(client);
    first.init({ windowMs: 60_000 } as Options);
    second.init({ windowMs: 60_000 } as Options);

    expect((await first.increment("203.0.113.10")).totalHits).toBe(1);
    expect((await second.increment("203.0.113.10")).totalHits).toBe(2);
    expect([...client.counts.keys()].every((key) => !key.includes("203.0.113.10"))).toBe(true);
  });

  it("enforces a limit in a single process", async () => {
    const app = express();
    app.use(rateLimit({ windowMs: 60_000, limit: 1 }));
    app.get("/private", (_request, response) => response.sendStatus(204));
    expect((await request(app).get("/private")).status).toBe(204);
    expect((await request(app).get("/private")).status).toBe(429);
  });

  it.each([
    { passOnStoreError: true, expected: 204 },
    { passOnStoreError: false, expected: 503 },
  ])(
    "uses explicit Redis outage behavior: passOnStoreError=$passOnStoreError",
    async ({ passOnStoreError, expected }) => {
      const app = express();
      app.use(
        rateLimit({
          windowMs: 60_000,
          limit: 1,
          store: new UnavailableStore(),
          passOnStoreError,
        }),
      );
      app.get("/private", (_request, response) => response.sendStatus(204));
      app.use(
        (
          _error: unknown,
          _request: express.Request,
          response: express.Response,
          _next: express.NextFunction,
        ) => {
          void _next;
          response.sendStatus(503);
        },
      );
      expect((await request(app).get("/private")).status).toBe(expected);
    },
  );
});

class FakeRedisClient implements RedisRateLimitClient {
  readonly counts = new Map<string, number>();

  eval(script: string, _numberOfKeys: number, key: string): Promise<unknown> {
    if (script.includes('redis.call("INCR"')) {
      const value = (this.counts.get(key) ?? 0) + 1;
      this.counts.set(key, value);
      return Promise.resolve([value, 60_000]);
    }
    const value = Math.max(0, (this.counts.get(key) ?? 0) - 1);
    if (value === 0) this.counts.delete(key);
    else this.counts.set(key, value);
    return Promise.resolve(value);
  }

  del(key: string): Promise<number> {
    return Promise.resolve(this.counts.delete(key) ? 1 : 0);
  }
}

class UnavailableStore implements Store {
  increment(): Promise<never> {
    return Promise.reject(new Error("Redis unavailable"));
  }

  decrement(): Promise<void> {
    return Promise.resolve();
  }

  resetKey(): Promise<void> {
    return Promise.resolve();
  }
}
