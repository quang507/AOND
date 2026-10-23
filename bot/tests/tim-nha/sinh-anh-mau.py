"""Sinh 4 ảnh minh hoạ cho rổ tin mẫu `seed_thu` (SRS-5.1zzzzzzz168): vẽ tay bằng Pillow, KHÔNG phải ảnh nhà thật, có dải chữ "ẢNH MẪU" để không ai nhầm.
Chạy lại: python3 bot/tests/tim-nha/sinh-anh-mau.py  (ghi vào bot/tests/tim-nha/anh-mau/). Tên tệp = loại ảnh trong `listing_media.media_type`."""
import pathlib
from PIL import Image, ImageDraw, ImageFont

RA = pathlib.Path(__file__).parent / "anh-mau"
RA.mkdir(exist_ok=True)
W, H = 960, 640
F = lambda n, c="DejaVuSans-Bold.ttf": ImageFont.truetype(c, n)


def khung(nen_tren, nen_duoi, nhan):
    im = Image.new("RGB", (W, H), nen_tren)
    d = ImageDraw.Draw(im)
    d.rectangle([0, int(H * 0.62), W, H], fill=nen_duoi)
    d.rectangle([0, H - 64, W, H], fill=(20, 33, 61))
    d.text((24, H - 52), "ẢNH MẪU — tin thử, không phải ảnh nhà thật", font=F(26), fill="white")
    d.text((W - 24, 20), nhan, font=F(30), fill=(20, 33, 61), anchor="ra")
    return im, d


def mat_tien():
    im, d = khung((178, 220, 245), (150, 150, 150), "Mặt tiền")
    d.rectangle([260, 170, 700, 400], fill=(236, 214, 170))            # thân nhà
    d.polygon([(230, 170), (480, 80), (730, 170)], fill=(165, 60, 50))  # mái
    d.rectangle([330, 230, 410, 320], fill=(120, 170, 210))            # cửa sổ
    d.rectangle([550, 230, 630, 320], fill=(120, 170, 210))
    d.rectangle([440, 290, 520, 400], fill=(110, 70, 40))              # cửa chính
    d.ellipse([90, 210, 200, 330], fill=(70, 140, 70))                 # cây
    d.rectangle([138, 330, 152, 400], fill=(100, 70, 40))
    return im


def phong_khach():
    im, d = khung((240, 232, 214), (186, 150, 110), "Phòng khách")
    d.rectangle([120, 90, 360, 280], fill=(150, 200, 235), outline=(90, 70, 50), width=8)   # cửa sổ
    d.rectangle([180, 330, 640, 430], fill=(70, 100, 140))                                  # sofa
    d.rectangle([160, 290, 680, 350], fill=(90, 120, 160))
    d.rectangle([700, 360, 840, 420], fill=(110, 80, 50))                                   # bàn
    return im


def phong_ngu():
    im, d = khung((232, 226, 240), (170, 140, 120), "Phòng ngủ")
    d.rectangle([180, 280, 760, 440], fill=(200, 90, 90))                                    # giường
    d.rectangle([180, 240, 330, 300], fill=(250, 250, 250))                                  # gối
    d.rectangle([350, 240, 500, 300], fill=(250, 250, 250))
    d.rectangle([780, 200, 880, 440], fill=(120, 85, 55))                                    # tủ
    d.rectangle([80, 100, 240, 220], fill=(150, 200, 235), outline=(90, 70, 50), width=6)    # cửa sổ
    return im


def bep():
    im, d = khung((236, 240, 230), (200, 190, 170), "Bếp")
    d.rectangle([100, 300, 860, 400], fill=(110, 80, 60))                                    # tủ bếp dưới
    d.rectangle([100, 280, 860, 304], fill=(60, 60, 60))                                     # mặt bàn
    d.rectangle([100, 110, 860, 200], fill=(135, 100, 75))                                   # tủ trên
    d.rectangle([380, 250, 560, 282], fill=(30, 30, 30))                                     # bếp
    d.ellipse([410, 255, 450, 275], fill=(220, 90, 40))
    return im


for ten, ve in (("mat_tien", mat_tien), ("trong_nha", phong_khach), ("phong_ngu", phong_ngu), ("bep", bep)):
    ve().save(RA / f"{ten}.jpg", "JPEG", quality=82, optimize=True)
    print(ten, (RA / f"{ten}.jpg").stat().st_size)
