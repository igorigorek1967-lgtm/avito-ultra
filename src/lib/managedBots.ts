/**
 * src/lib/managedBots.ts
 *
 * CRUD helpers for the `managed_bots` table.
 * All operations are scoped to the authenticated user via RLS.
 *
 * Telegram Bot API version targeted: 9.6
 */

import { supabase } from "@/lib/supabaseClient";
import type {
  ManagedBot,
  ManagedBotInsert,
  ManagedBotUpdate,
} from "@/types/database";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface RegisterBotPayload {
  /** The token returned by @BotFather (Telegram Bot API 9.6) */
  managed_bot_token: string;
  /** Human-readable username of the bot (without @) */
  bot_username: string;
  /** Optional: link the bot to an Avito project */
  project_id?: string;
  /** Optional: pre-configured webhook URL */
  webhook_url?: string;
}

export interface BotOperationResult<T = ManagedBot> {
  data: T | null;
  error: Error | null;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Validates that a string looks like a Telegram bot token.
 * Format: <bot_id>:<random_string>
 */
function isValidBotToken(token: string): boolean {
  return /^\d{8,12}:[A-Za-z0-9_-]{35,}$/.test(token.trim());
}

/**
 * Extracts the numeric Telegram bot ID from a token.
 * e.g. "123456789:ABC..." → "123456789"
 */
function extractBotId(token: string): string {
  return token.split(":")[0];
}

// ─────────────────────────────────────────────
// Register / Create
// ─────────────────────────────────────────────

/**
 * Registers a new Managed Bot in the database.
 *
 * Called by the Manager Bot after the user provides a token via Telegram.
 * The `managed_bot_token` is stored as-is; encrypt it at the DB level
 * using pgcrypto or Vault (see schema.sql).
 *
 * @param userId  - The authenticated user's UUID (from session.user.id)
 * @param payload - Bot registration data
 */
export async function registerManagedBot(
  userId: string,
  payload: RegisterBotPayload
): Promise<BotOperationResult> {
  try {
    const token = payload.managed_bot_token.trim();

    if (!isValidBotToken(token)) {
      return {
        data: null,
        error: new Error(
          "Invalid Telegram bot token format. " +
            "Expected format: <bot_id>:<random_string>"
        ),
      };
    }

    // Check for duplicate token (same user)
    const { data: existing, error: checkError } = await supabase
      .from("managed_bots")
      .select("id")
      .eq("user_id", userId)
      .eq("managed_bot_token", token)
      .maybeSingle();

    if (checkError) {
      console.error("[managedBots] duplicate check error:", checkError.message);
      return { data: null, error: new Error(checkError.message) };
    }

    if (existing) {
      return {
        data: null,
        error: new Error(
          "A bot with this token is already registered to your account."
        ),
      };
    }

    const insert: ManagedBotInsert = {
      user_id: userId,
      project_id: payload.project_id ?? null,
      bot_username: payload.bot_username.replace(/^@/, "").trim(),
      managed_bot_token: token,
      telegram_bot_id: extractBotId(token),
      status: "inactive",
      api_version: "9.6",
      webhook_url: payload.webhook_url ?? null,
      settings: {},
    };

    const { data, error } = await supabase
      .from("managed_bots")
      .insert(insert)
      .select()
      .single();

    if (error) {
      console.error("[managedBots] insert error:", error.message);
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as ManagedBot, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[managedBots] registerManagedBot unexpected error:", error.message);
    return { data: null, error };
  }
}

// ─────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────

/**
 * Fetches all bots belonging to the authenticated user.
 * RLS ensures only the owner's rows are returned.
 */
export async function getUserBots(
  userId: string
): Promise<BotOperationResult<ManagedBot[]>> {
  try {
    const { data, error } = await supabase
      .from("managed_bots")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[managedBots] getUserBots error:", error.message);
      return { data: null, error: new Error(error.message) };
    }

    return { data: (data ?? []) as ManagedBot[], error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[managedBots] getUserBots unexpected error:", error.message);
    return { data: null, error };
  }
}

/**
 * Fetches a single bot by its UUID.
 * RLS ensures the caller can only read their own bots.
 */
export async function getBotById(
  botId: string
): Promise<BotOperationResult> {
  try {
    const { data, error } = await supabase
      .from("managed_bots")
      .select("*")
      .eq("id", botId)
      .single();

    if (error) {
      console.error("[managedBots] getBotById error:", error.message);
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as ManagedBot, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[managedBots] getBotById unexpected error:", error.message);
    return { data: null, error };
  }
}

// ─────────────────────────────────────────────
// Update
// ─────────────────────────────────────────────

/**
 * Updates mutable fields of a managed bot.
 */
export async function updateManagedBot(
  botId: string,
  updates: ManagedBotUpdate
): Promise<BotOperationResult> {
  try {
    const { data, error } = await supabase
      .from("managed_bots")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", botId)
      .select()
      .single();

    if (error) {
      console.error("[managedBots] updateManagedBot error:", error.message);
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as ManagedBot, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[managedBots] updateManagedBot unexpected error:", error.message);
    return { data: null, error };
  }
}

/**
 * Activates a bot (sets status → "active").
 */
export async function activateBot(botId: string): Promise<BotOperationResult> {
  return updateManagedBot(botId, { status: "active" });
}

/**
 * Deactivates a bot (sets status → "inactive").
 */
export async function deactivateBot(
  botId: string
): Promise<BotOperationResult> {
  return updateManagedBot(botId, { status: "inactive" });
}

/**
 * Updates the webhook URL for a bot.
 * Call this after registering the webhook with Telegram's setWebhook API.
 */
export async function setBotWebhook(
  botId: string,
  webhookUrl: string
): Promise<BotOperationResult> {
  return updateManagedBot(botId, { webhook_url: webhookUrl });
}

// ─────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────

/**
 * Permanently removes a managed bot from the database.
 * RLS ensures only the owner can delete their own bots.
 */
export async function deleteManagedBot(
  botId: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from("managed_bots")
      .delete()
      .eq("id", botId);

    if (error) {
      console.error("[managedBots] deleteManagedBot error:", error.message);
      return { error: new Error(error.message) };
    }

    return { error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[managedBots] deleteManagedBot unexpected error:", error.message);
    return { error };
  }
}

// ─────────────────────────────────────────────
// Telegram API 9.6 — Webhook registration helper
// ─────────────────────────────────────────────

interface TelegramWebhookResult {
  ok: boolean;
  description?: string;
  error: Error | null;
}

/**
 * Calls Telegram's `setWebhook` endpoint (Bot API 9.6) and then
 * persists the webhook URL in the database.
 *
 * @param botId      - The managed_bots UUID in our database
 * @param botToken   - The Telegram bot token
 * @param webhookUrl - The public HTTPS URL Telegram should POST updates to
 */
export async function registerTelegramWebhook(
  botId: string,
  botToken: string,
  webhookUrl: string
): Promise<TelegramWebhookResult> {
  try {
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;

    const response = await fetch(telegramApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: [
          "message",
          "callback_query",
          "inline_query",
          "my_chat_member",
        ],
        drop_pending_updates: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        description: `Telegram API HTTP ${response.status}: ${text}`,
        error: new Error(`Telegram setWebhook failed: ${text}`),
      };
    }

    const json = (await response.json()) as { ok: boolean; description?: string };

    if (!json.ok) {
      return {
        ok: false,
        description: json.description,
        error: new Error(`Telegram setWebhook error: ${json.description}`),
      };
    }

    // Persist the webhook URL in our database
    const { error: dbError } = await setBotWebhook(botId, webhookUrl);
    if (dbError) {
      console.warn(
        "[managedBots] Webhook set on Telegram but DB update failed:",
        dbError.message
      );
    }

    return { ok: true, description: json.description, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[managedBots] registerTelegramWebhook unexpected error:", error.message);
    return { ok: false, error };
  }
}
