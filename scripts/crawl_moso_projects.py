"""Crawl toàn bộ danh mục dự án TP.HCM từ MOSO Agent API (chuẩn bị làm giàu cho bảng projects).
Chạy: python scripts/crawl_moso_projects.py
"""
import urllib.request
import urllib.parse
import ssl
import json
import sys
import time
import os

sys.stdout.reconfigure(encoding='utf-8')

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

STATUS_MAP = {
    "booking_open": "Đang nhận booking",
    "open": "Đang mở bán",
    "delivered": "Đã bàn giao",
    "closed": "Đã bán hết",
    "upcoming": "Sắp mở bán"
}

def clean_location(address_str: str) -> tuple[str, str]:
    """Tách 'Nhà Bè, TP.HCM' hoặc 'P.22, Q. Bình Thạnh, TP.HCM' thành (district, province)."""
    if not address_str:
        return "", "Hồ Chí Minh"
    parts = [p.strip() for p in address_str.split(",") if p.strip()]
    if len(parts) >= 2:
        district = parts[-2]
        province = parts[-1]
    elif len(parts) == 1:
        district = parts[0]
        province = "Hồ Chí Minh"
    else:
        district, province = "", "Hồ Chí Minh"
    
    # Chuẩn hoá tên quận
    district = district.replace("Q.", "Quận ").replace("Huyện ", "").strip()
    return district, province

def fetch_all_moso_projects(location: str = "Hồ Chí Minh", limit: int = 50) -> list[dict]:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    loc_encoded = urllib.parse.quote(location)
    base_url = f"https://moso.vn/api/agent/projects?location={loc_encoded}&limit={limit}&offset="

    all_projects = []
    offset = 0
    total = None

    print(f"Bắt đầu tải dữ liệu dự án tại {location} từ MOSO API...")

    while True:
        url = base_url + str(offset)
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                
                if total is None:
                    total = data.get("count", 0)
                    print(f"Tổng số dự án trên MOSO: {total}")

                results = data.get("results", [])
                if not results:
                    break

                for item in results:
                    district, province = clean_location(item.get("address", ""))
                    prices = item.get("unitPrices") or []
                    p_min = round(prices[0]) if len(prices) > 0 and prices[0] is not None else None
                    p_max = round(prices[1]) if len(prices) > 1 and prices[1] is not None else p_min

                    sale_status = item.get("saleStatus") or ""
                    status_vn = STATUS_MAP.get(sale_status, sale_status)

                    proj = {
                        "name": (item.get("name") or "").strip(),
                        "url": item.get("url") or "",
                        "developer": (item.get("investor") or "").strip(),
                        "district": district,
                        "province": province,
                        "location_raw": item.get("address") or "",
                        "unit_types": item.get("unitTypes") or [],
                        "unit_type_label": item.get("unitTypeLabel") or "",
                        "sale_status": sale_status,
                        "status_text": status_vn,
                        "price_min": p_min,
                        "price_max": p_max,
                        "average_price_m2": item.get("averagePricePerM2"),
                        "number_of_units": item.get("numberOfUnits"),
                        "bank_support": True,
                        "max_loan_ratio": 70
                    }
                    all_projects.append(proj)

                offset += len(results)
                print(f"  Đã tải {offset}/{total} dự án...")

                if offset >= total:
                    break

                time.sleep(0.4) # Tránh vượt giới hạn 60 req/min
        except Exception as e:
            print(f"[LỖI] tại offset {offset}: {e}")
            break

    print(f"\n Hoàn tất! Thu thập được {len(all_projects)} dự án.")
    return all_projects

if __name__ == "__main__":
    projects = fetch_all_moso_projects("Hồ Chí Minh")
    out_path = os.path.join(os.path.dirname(__file__), "moso_projects_hcm.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(projects, f, ensure_ascii=False, indent=2)
    print(f"Đã lưu kết quả vào: {out_path} ({os.path.getsize(out_path)//1024} KB)")
