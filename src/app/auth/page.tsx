"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./auth.module.css";

type Mode = "login" | "register";

export default function AuthPage() {
  const router = useRouter();
  const { signIn, signUp, user, loading } = useAuth();

  const [mode, setMode] = useState<Mode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  const validate = useCallback((): string | null => {
    if (!email.trim()) return "Введите email";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return "Некорректный email";
    if (!password) return "Введите пароль";
    if (password.length > 72)
      return "Password cannot be longer than 72 characters";
    if (mode === "register") {
      if (password.length < 6) return "Пароль должен быть не менее 6 символов";
      if (password !== confirmPassword) return "Пароли не совпадают";
    }
    return null;
  }, [email, password, confirmPassword, mode]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const validationError = validate();
      if (validationError) {
        setError(validationError);
        return;
      }

      setSubmitting(true);
      try {
        if (mode === "register") {
          const { error: authError } = await signUp({ email, password });
          if (authError) {
            setError(authError.message);
            return;
          }
          // Supabase may require email confirmation — redirect to dashboard anyway;
          // the AuthContext will handle the session once confirmed.
          router.replace("/dashboard");
        } else {
          const { error: authError } = await signIn({ email, password });
          if (authError) {
            setError(authError.message);
            return;
          }
          router.replace("/dashboard");
        }
      } finally {
        setSubmitting(false);
      }
    },
    [mode, email, password, confirmPassword, validate, signIn, signUp, router]
  );

  const toggleMode = useCallback(() => {
    setMode((m) => (m === "register" ? "login" : "register"));
    setError(null);
    setPassword("");
    setConfirmPassword("");
  }, []);

  if (loading) {
    return (
      <div className={styles.page}>
        <span className={styles.loadingDot} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <h1 className={styles.title}>
          {mode === "register" ? "Регистрация" : "Вход"}
        </h1>

        <input
          className={styles.input}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          disabled={submitting}
        />

        <input
          className={styles.input}
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={
            mode === "register" ? "new-password" : "current-password"
          }
          disabled={submitting}
        />

        {mode === "register" && (
          <input
            className={`${styles.input} ${error ? styles.inputError : ""}`}
            type="password"
            placeholder="Подтвердите пароль"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            disabled={submitting}
          />
        )}

        {error && <p className={styles.errorText}>{error}</p>}

        <button
          className={styles.submitBtn}
          type="submit"
          disabled={submitting}
        >
          {submitting
            ? "Загрузка…"
            : mode === "register"
            ? "Зарегистрироваться"
            : "Войти"}
        </button>

        <button
          type="button"
          className={styles.toggleBtn}
          onClick={toggleMode}
          disabled={submitting}
        >
          {mode === "register"
            ? "Уже есть аккаунт? Войти"
            : "Нет аккаунта? Зарегистрироваться"}
        </button>
      </form>
    </div>
  );
}
