import { createClient } from "@supabase/supabase-js";
import { AppError } from "../errors.js";

export interface PrivateStorage {
  checkHealth(): Promise<void>;
  upload(path: string, bytes: Buffer, mimeType: string): Promise<void>;
  createSignedUrl(path: string, ttlSeconds: number): Promise<string>;
  remove(path: string): Promise<void>;
}

export class SupabasePrivateStorage implements PrivateStorage {
  private readonly client;

  constructor(
    url: string,
    serviceRoleKey: string,
    private readonly bucket: string,
  ) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async checkHealth(): Promise<void> {
    const { data, error } = await this.client.storage.getBucket(this.bucket);
    if (error || !data || data.public) {
      throw new AppError(503, "STORAGE_UNAVAILABLE", "Private file storage is unavailable.");
    }
  }

  async upload(path: string, bytes: Buffer, mimeType: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).upload(path, bytes, {
      contentType: mimeType,
      upsert: false,
    });
    if (error)
      throw new AppError(503, "STORAGE_UNAVAILABLE", "The file could not be stored right now.");
  }

  async createSignedUrl(path: string, ttlSeconds: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(path, ttlSeconds);
    if (error)
      throw new AppError(503, "STORAGE_UNAVAILABLE", "The file is temporarily unavailable.");
    return data.signedUrl;
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([path]);
    if (error)
      throw new AppError(503, "STORAGE_UNAVAILABLE", "The file could not be removed right now.");
  }
}
