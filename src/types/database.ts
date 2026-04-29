/**
 * TypeScript types auto-generated from the Supabase database schema.
 * Keep in sync with database/schema.sql
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

export type BotStatus = "active" | "inactive" | "error";
export type ProjectStatus = "active" | "paused" | "archived";

// ─────────────────────────────────────────────
// Table row types
// ─────────────────────────────────────────────

/** Mirrors the `profiles` table */
export interface Profile {
  id: string; // UUID — references auth.users(id)
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  telegram_user_id: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

/** Mirrors the `avito_projects` table */
export interface AvitoProject {
  id: string; // UUID
  user_id: string; // UUID — references profiles(id)
  name: string;
  avito_account_id: string | null;
  avito_client_id: string | null;
  avito_client_secret: string | null; // stored encrypted
  status: ProjectStatus;
  settings: Json;
  created_at: string;
  updated_at: string;
}

/** Mirrors the `managed_bots` table */
export interface ManagedBot {
  id: string; // UUID
  user_id: string; // UUID — references profiles(id)
  project_id: string | null; // UUID — references avito_projects(id)
  bot_username: string;
  managed_bot_token: string; // Telegram Bot API token (stored encrypted)
  telegram_bot_id: string | null;
  status: BotStatus;
  api_version: string; // e.g. "9.6"
  webhook_url: string | null;
  settings: Json;
  created_at: string;
  updated_at: string;
}

/** Mirrors the `bot_sessions` table */
export interface BotSession {
  id: string; // UUID
  bot_id: string; // UUID — references managed_bots(id)
  user_id: string; // UUID — references profiles(id)
  telegram_chat_id: string;
  session_data: Json;
  last_activity_at: string;
  created_at: string;
}

// ─────────────────────────────────────────────
// Insert / Update helpers (omit server-generated fields)
// ─────────────────────────────────────────────

export type ProfileInsert = Omit<Profile, "created_at" | "updated_at">;
export type ProfileUpdate = Partial<Omit<Profile, "id" | "created_at">>;

export type AvitoProjectInsert = Omit<
  AvitoProject,
  "id" | "created_at" | "updated_at"
>;
export type AvitoProjectUpdate = Partial<
  Omit<AvitoProject, "id" | "user_id" | "created_at">
>;

export type ManagedBotInsert = Omit<
  ManagedBot,
  "id" | "created_at" | "updated_at"
>;
export type ManagedBotUpdate = Partial<
  Omit<ManagedBot, "id" | "user_id" | "created_at">
>;

// ─────────────────────────────────────────────
// Supabase Database generic type (used by createClient<Database>)
// ─────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      avito_projects: {
        Row: AvitoProject;
        Insert: AvitoProjectInsert;
        Update: AvitoProjectUpdate;
      };
      managed_bots: {
        Row: ManagedBot;
        Insert: ManagedBotInsert;
        Update: ManagedBotUpdate;
      };
      bot_sessions: {
        Row: BotSession;
        Insert: Omit<BotSession, "id" | "created_at">;
        Update: Partial<Omit<BotSession, "id" | "created_at">>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      bot_status: BotStatus;
      project_status: ProjectStatus;
    };
  };
}
