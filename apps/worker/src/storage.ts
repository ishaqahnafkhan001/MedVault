import { createClient } from "@supabase/supabase-js";
import type { ReportFileStorage } from "./processor.js";

export class SupabaseReportFileStorage implements ReportFileStorage {
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

  async download(path: string): Promise<Uint8Array> {
    const { data, error } = await this.client.storage.from(this.bucket).download(path);
    if (error) throw new Error("Private report download failed");
    return new Uint8Array(await data.arrayBuffer());
  }
}
