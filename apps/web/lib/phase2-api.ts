import { apiRequest } from "./api";
export { summaryResponseSchema } from "@medvault/shared";
export async function validatedRequest<T>(
  schema: { parse(value: unknown): T },
  path: string,
  init?: RequestInit,
): Promise<T> {
  return schema.parse(await apiRequest<unknown>(path, init));
}
export function summaryPollInterval(
  status: string | undefined,
  updatedAt: string | undefined,
  now = Date.now(),
): number | false {
  if (!updatedAt || !status || !["QUEUED", "PROCESSING"].includes(status)) return false;
  return now - Date.parse(updatedAt) < 120_000 ? 3000 : false;
}

export function signedFileRefreshInterval(expiresInSeconds: number | undefined): number | false {
  if (!expiresInSeconds || !Number.isFinite(expiresInSeconds)) return false;
  return Math.max(5_000, (expiresInSeconds - 30) * 1_000);
}
