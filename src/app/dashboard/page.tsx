"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getUserBots } from "@/lib/managedBots";
import type { ManagedBot } from "@/types/database";
import styles from "./dashboard.module.css";

export default function DashboardPage() {
  const router = useRouter();
  const { user, profile, signOut, loading } = useAuth();

  const [bots, setBots] = useState<ManagedBot[]>([]);
  const [botsLoading, setBotsLoading] = useState(true);
  const [botsError, setBotsError] = useState<string | null>(null);

  // Redirect unauthenticated users
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
    }
  }, [user, loading, router]);

  // Load bots
  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setBotsLoading(true);
      const { data, error } = await getUserBots(user.id);
      if (error) {
        setBotsError(error.message);
      } else {
        setBots(data ?? []);
      }
      setBotsLoading(false);
    };

    load();
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/auth");
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loader}>Загрузка…</div>
      </div>
    );
  }

  if (!user) return null; // will redirect

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo}>🤖 Avito Bots</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.userEmail}>
            {profile?.email ?? user.email}
          </span>
          <button className={styles.signOutBtn} onClick={handleSignOut}>
            Выйти
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className={styles.main}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Мои боты</h2>
          <button
            className={styles.addBtn}
            onClick={() => router.push("/dashboard/bots/new")}
          >
            + Добавить бота
          </button>
        </div>

        {botsLoading && (
          <p className={styles.stateText}>Загрузка ботов…</p>
        )}

        {!botsLoading && botsError && (
          <p className={styles.errorText}>Ошибка: {botsError}</p>
        )}

        {!botsLoading && !botsError && bots.length === 0 && (
          <div className={styles.emptyState}>
            <p className={styles.emptyIcon}>🤖</p>
            <p className={styles.emptyTitle}>Нет ботов</p>
            <p className={styles.emptySubtitle}>
              Добавьте первого бота, нажав кнопку выше
            </p>
          </div>
        )}

        {!botsLoading && !botsError && bots.length > 0 && (
          <div className={styles.botGrid}>
            {bots.map((bot) => (
              <div key={bot.id} className={styles.botCard}>
                <div className={styles.botCardTop}>
                  <span className={styles.botUsername}>@{bot.bot_username}</span>
                  <span
                    className={`${styles.statusBadge} ${
                      bot.status === "active"
                        ? styles.statusActive
                        : bot.status === "error"
                        ? styles.statusError
                        : styles.statusInactive
                    }`}
                  >
                    {bot.status === "active"
                      ? "Активен"
                      : bot.status === "error"
                      ? "Ошибка"
                      : "Неактивен"}
                  </span>
                </div>
                <p className={styles.botMeta}>
                  API {bot.api_version} &nbsp;·&nbsp; ID {bot.telegram_bot_id ?? "—"}
                </p>
                {bot.webhook_url && (
                  <p className={styles.botWebhook} title={bot.webhook_url}>
                    🔗 {bot.webhook_url}
                  </p>
                )}
                <p className={styles.botDate}>
                  Добавлен:{" "}
                  {new Date(bot.created_at).toLocaleDateString("ru-RU")}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
