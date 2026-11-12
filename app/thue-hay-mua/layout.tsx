import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thuê hay mua nhà: tính xem đường nào lợi hơn",
  description:
    "Đặt mua nhà trả góp và đi thuê cạnh nhau với cùng số tiền mỗi tháng, xem sau 5, 10, 20 năm bên nào dư hơn. Tự sửa giá nhà, tiền thuê, lãi vay, lãi gửi.",
  alternates: { canonical: "/thue-hay-mua" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
