import { eq } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { googleToken } from "../memory/schema";
import type { TokenCache } from "./calendar";

const SINGLE_ROW_ID = 1;

/** Persists the Google access token in the single-row google_token table. */
export class DrizzleTokenCache implements TokenCache {
  constructor(private readonly db: DrizzleSqliteDODatabase) {}

  read(): { accessToken: string; expiresAt: number } | undefined {
    const row = this.db
      .select()
      .from(googleToken)
      .where(eq(googleToken.id, SINGLE_ROW_ID))
      .get();
    if (!row) {
      return;
    }
    return { accessToken: row.accessToken, expiresAt: row.expiresAt };
  }

  write(accessToken: string, expiresAt: number): void {
    this.db
      .insert(googleToken)
      .values({ id: SINGLE_ROW_ID, accessToken, expiresAt })
      .onConflictDoUpdate({
        target: googleToken.id,
        set: { accessToken, expiresAt },
      })
      .run();
  }
}
