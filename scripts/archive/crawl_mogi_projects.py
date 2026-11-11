import sys
import os
import re
import json
import time
import urllib.request
from bs4 import BeautifulSoup

sys.stdout.reconfigure(encoding='utf-8')

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

REGIONS = [
    {"name": "Hồ Chí Minh", "cid": "30", "slug": "ho-chi-minh", "max_pages": 15},
    {"name": "Bình Dương", "cid": "9", "slug": "binh-duong", "max_pages": 10},
    {"name": "Đồng Nai", "cid": "19", "slug": "dong-nai", "max_pages": 8},
    {"name": "Long An", "cid": "40", "slug": "long-an", "max_pages": 8},
    {"name": "Tây Ninh", "cid": "54", "slug": "tay-ninh", "max_pages": 3},
]

def fetch_url(url: str, retries=3) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.read().decode('utf-8', errors='ignore')
        except Exception as e:
            if attempt == retries - 1:
                print(f"[ERROR] Failed to fetch {url}: {e}")
                return ""
            time.sleep(1.5)
    return ""

def parse_project_card(card, province_name: str) -> dict | None:
    try:
        # Title & link
        link_elem = card.find("a", class_="link-overlay") or card.find("a", href=re.compile(r'/.*-prj\d+'))
        if not link_elem:
            title_elem = card.find(["h2", "h3"], class_=re.compile(r'title', re.I))
            if title_elem and title_elem.find("a"):
                link_elem = title_elem.find("a")
            elif title_elem and title_elem.parent.name == "a":
                link_elem = title_elem.parent

        if not link_elem:
            return None

        href = link_elem.get("href", "")
        slug = href.strip("/").split("/")[-1]
        name = link_elem.get_text(strip=True)
        if not name:
            title_tag = card.find(["h2", "h3", "h4"])
            if title_tag:
                name = title_tag.get_text(strip=True)

        if not name or len(name) < 2:
            return None

        # Cover Image
        img_tag = card.find("img")
        cover_image = ""
        if img_tag:
            cover_image = img_tag.get("data-src") or img_tag.get("src") or ""
            if cover_image.startswith("/"):
                cover_image = f"https://mogi.vn{cover_image}"

        # Investor / Organization
        org_tag = card.find(class_=re.compile(r'project-org|org', re.I))
        investor = org_tag.get_text(strip=True) if org_tag else ""

        # Address & Handover
        addr_tag = card.find(class_=re.compile(r'project-address|address', re.I))
        raw_address = addr_tag.get_text(" ", strip=True) if addr_tag else ""
        handover = ""
        district = ""
        
        if "Bàn giao:" in raw_address:
            parts = raw_address.split("Bàn giao:")
            addr_part = parts[0].replace("|", "").strip()
            handover = parts[1].strip()
        else:
            addr_part = raw_address.strip()

        # Parse district from address part (e.g. "Quận 2 (TP. Thủ Đức), TPHCM")
        if addr_part:
            d_parts = [p.strip() for p in addr_part.split(",") if p.strip()]
            if d_parts:
                district = d_parts[0]

        # Price
        price_tag = card.find(class_=re.compile(r'project-avg-price|price', re.I))
        price_text = price_tag.get_text(" ", strip=True) if price_tag else ""
        
        price_range = ""
        price_per_m2 = ""
        if "(" in price_text and ")" in price_text:
            m = re.search(r'\((.*?)\)', price_text)
            if m:
                price_per_m2 = m.group(1).strip()
            price_range = re.sub(r'\(.*?\)', '', price_text).strip()
        else:
            price_range = price_text

        # Status tags
        status_tags = []
        for tag in card.find_all(class_=re.compile(r'project-search-link|tag|status', re.I)):
            for a in tag.find_all("a"):
                st = a.get_text(strip=True)
                if st and st not in status_tags:
                    status_tags.append(st)

        return {
            "name": name,
            "slug": slug,
            "mogi_url": f"https://mogi.vn{href}" if href.startswith("/") else href,
            "investor": investor,
            "address": addr_part or f"{district}, {province_name}".strip(", "),
            "district": district,
            "province": province_name,
            "handover": handover,
            "price_range": price_range,
            "price_per_m2": price_per_m2,
            "cover_image": cover_image,
            "status_tags": status_tags,
        }
    except Exception as e:
        print(f"[WARN] Error parsing card: {e}")
        return None

def crawl_all_regions():
    all_projects = []
    seen_slugs = set()

    for reg in REGIONS:
        p_name = reg["name"]
        cid = reg["cid"]
        slug = reg["slug"]
        max_p = reg["max_pages"]

        print(f"\n==========================================")
        print(f"[*] Crawling {p_name} (CID: {cid}) - Up to {max_p} pages...")
        print(f"==========================================")

        for page in range(1, max_p + 1):
            url = f"https://mogi.vn/du-an/{slug}-cid{cid}" if page == 1 else f"https://mogi.vn/du-an/{slug}-cid{cid}?cp={page}"
            print(f"--> Fetching {p_name} page {page}: {url}")
            html = fetch_url(url)
            if not html:
                break

            soup = BeautifulSoup(html, "html.parser")
            cards = soup.find_all("div", class_=re.compile(r'project\b', re.I))
            if not cards:
                # Fallback to items
                cards = soup.find_all("div", class_="project-summarize")
                cards = [c.parent for c in cards if c.parent]

            if not cards:
                print(f"   [!] No project cards found on page {page}, stopping {p_name}.")
                break

            new_in_page = 0
            for card in cards:
                item = parse_project_card(card, p_name)
                if item and item["slug"] and item["slug"] not in seen_slugs:
                    seen_slugs.add(item["slug"])
                    all_projects.append(item)
                    new_in_page += 1

            print(f"   [+] Page {page} yielded {new_in_page} new projects (Total so far: {len(all_projects)})")
            if new_in_page == 0:
                print(f"   [!] No new projects on page {page}, moving to next region.")
                break

            time.sleep(1.0) # Polite delay

    print(f"\n==========================================")
    print(f"[DONE] Crawled {len(all_projects)} total unique projects across 5 provinces!")
    print(f"==========================================")

    # Save to data directory
    os.makedirs("data", exist_ok=True)
    out_path = os.path.join("data", "mogi_projects.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(all_projects, f, ensure_ascii=False, indent=2)
    print(f"[SAVED] Stored {len(all_projects)} projects to {out_path}")

    # Generate summary stats
    by_prov = {}
    for p in all_projects:
        prov = p["province"]
        by_prov[prov] = by_prov.get(prov, 0) + 1
    print("Region breakdown:", by_prov)

if __name__ == "__main__":
    crawl_all_regions()
