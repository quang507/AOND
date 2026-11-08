"""Nền test chạy ĐÚNG cấu hình production (audit Đợt 0, SRS-5.1zzzzzzz316, AU-05).

Mọi bài mặc định nhận các công tắc lõi y như khách thật trên VPS (đọc từ `bot/bridge-zca/cai-vps.sh`, "thu" = tắt). Bài cần nhánh cũ / nhánh
ID thử thì tự `monkeypatch.setenv(...)` — đặt trong bài thắng giá trị ở đây. Trước đây env rỗng = mọi công tắc tắt, nên test đi đường mà
production không đi (AU-02, AU-06 lọt vì vậy).

Bài kiểm NHÁNH CŨ (đường production không còn đi, giữ sau công tắc) ghi rõ bằng `@pytest.mark.nhanh_cu(AIOI_…="tat")` — nhìn là biết bài đó
không bảo vệ đường khách thật. Bài lộ lỗi thật của đường production thì `xfail(strict=True)` kèm mã audit, không ép về nhánh cũ."""
from __future__ import annotations

import os

import pytest

from tests.cau_hinh_vps import cong_tac

CONG_TAC_PRODUCTION = cong_tac()
# SRS-5.1zzzzzzz321: lõi không còn lặng lẽ rơi về mock khi thiếu ANTHROPIC_API_KEY — test bật mock TƯỜNG MINH (đặt trước khi module nào
# dựng provider lúc import, vd `server`). Bài nào cần provider khác tự đặt.
os.environ.setdefault("AIOI_LLM_PROVIDER", "mock")

# SRS-5.1zzzzzzz400: lõi đòi header `x-noi-bo-key` ở mọi đường trừ /health. Bài test gọi lõi qua TestClient như bridge thật → mọi
# TestClient mặc định kèm khoá thử; bài kiểm chính cái cổng (test_khoa_noi_bo.py) tự gỡ / đổi header.
KHOA_NOI_BO_THU = "khoa-noi-bo-chi-de-test"
os.environ["AIOI_NOI_BO_KEY"] = KHOA_NOI_BO_THU

from fastapi.testclient import TestClient as _TestClient  # noqa: E402

_tc_init_goc = _TestClient.__init__


def _tc_init_kem_khoa(self, *a, headers=None, **kw):
    _tc_init_goc(self, *a, headers={"x-noi-bo-key": KHOA_NOI_BO_THU, **(headers or {})}, **kw)


_TestClient.__init__ = _tc_init_kem_khoa


def pytest_configure(config):
    config.addinivalue_line("markers", "nhanh_cu(**cong_tac): bài kiểm nhánh cũ — đặt các công tắc này thay cấu hình production")


@pytest.fixture(autouse=True)
def _cau_hinh_nhu_production(monkeypatch, request):
    tat_mot = os.environ.get("AIOI_TAT_MOT")   # chỉ cho công cụ chia lỗi theo công tắc (tắt đúng một công tắc), không dùng trong CI
    for k, v in CONG_TAC_PRODUCTION.items():
        monkeypatch.setenv(k, "tat" if k == tat_mot else v)
    dau = request.node.get_closest_marker("nhanh_cu")
    for k, v in (dau.kwargs if dau else {}).items():
        monkeypatch.setenv(k, v)
