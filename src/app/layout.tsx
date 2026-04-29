import './globals.css';
import type { Metadata } from "next";
import { AuthProvider } from "@/contexts/AuthContext";

export const metadata: Metadata = {
  title: "OmniHub",
  description: "Бизнес-платформа под ключ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        {/* Скачиваем дизайн напрямую */}
        <script src="https://cdn.tailwindcss.com"></script>
        {/* Вшиваем наш Брендбук (Цвета логотипа) */}
        <script dangerouslySetInnerHTML={{
          __html: `
            tailwind.config = {
              theme: {
                extend: {
                  colors: {
                    brand: {
                      blue: '#2563EB',
                      purple: '#7B2CBF',
                      dark: '#0F172A',
                      light: '#F8FAFC',
                    }
                  }
                }
              }
            }
          `
        }} />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}