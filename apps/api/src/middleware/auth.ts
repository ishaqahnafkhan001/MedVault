import { createClient } from "@supabase/supabase-js";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors.js";
import type { AuthVerifier, AuthenticatedUser } from "../types.js";

declare global {
  // Express uses declaration merging for strongly typed response locals.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      auth: AuthenticatedUser;
    }
  }
}

export class SupabaseAuthVerifier implements AuthVerifier {
  private readonly client;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async verify(accessToken: string): Promise<AuthenticatedUser | null> {
    const { data, error } = await this.client.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return { id: data.user.id };
  }
}

export function authenticate(verifier: AuthVerifier) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const authorization = request.header("authorization");
      if (!authorization?.startsWith("Bearer ")) {
        throw new AppError(401, "UNAUTHENTICATED", "Please sign in to continue.");
      }
      const token = authorization.slice("Bearer ".length).trim();
      const user = token ? await verifier.verify(token) : null;
      if (!user) throw new AppError(401, "UNAUTHENTICATED", "Your session is invalid or expired.");
      response.locals.auth = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}
