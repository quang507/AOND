// Khung CRM cho toàn bộ /admin/* (09/09/2026). Header/Footer công khai tự ẩn
// khi pathname bắt đầu bằng /admin (xem components/Header.tsx, Footer.tsx).
import AdminShell from "@/components/AdminShell";

export const metadata = { title: "CRM · AI Ơi Nhà Đất" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
