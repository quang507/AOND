"""Unit tests for voice note transcription and integration into chat-reply."""
from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from aioi.server import app
from aioi.voice import is_audio_file, transcribe_audio_bytes, transcribe_voice_url


class TestVoiceModule(unittest.TestCase):
    def test_is_audio_file(self):
        self.assertTrue(is_audio_file("https://res.zalo.me/audio/test.m4a"))
        self.assertTrue(is_audio_file("https://res.zalo.me/audio/test.mp3"))
        self.assertTrue(is_audio_file("https://res.zalo.me/audio/test.wav"))
        self.assertTrue(is_audio_file("https://res.zalo.me/audio/test.ogg"))
        self.assertTrue(is_audio_file("https://res.zalo.me/file", file_name="tin_nhan_thoai.m4a"))
        self.assertTrue(is_audio_file("https://res.zalo.me/voice_note_123"))

        self.assertFalse(is_audio_file("https://res.zalo.me/photos/deed.jpg"))
        self.assertFalse(is_audio_file("https://res.zalo.me/photos/house.png"))
        self.assertFalse(is_audio_file("https://res.zalo.me/docs/so_do.pdf", file_name="so_do.pdf"))

    @patch("httpx.Client.post")
    def test_transcribe_audio_bytes(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"text": "Anh bán nhà 3 tầng đường Huỳnh Tấn Phát quận 7"}
        mock_post.return_value = mock_resp

        result = transcribe_audio_bytes(
            audio_bytes=b"fake_audio_bytes_1234567890_1234567890_1234567890_1234567890",
            filename="voice.m4a",
            groq_api_key="gsk_test_key",
        )
        self.assertEqual(result, "Anh bán nhà 3 tầng đường Huỳnh Tấn Phát quận 7")

    @patch("httpx.Client.get")
    @patch("httpx.Client.post")
    def test_transcribe_voice_url(self, mock_post, mock_get):
        mock_get_resp = MagicMock()
        mock_get_resp.status_code = 200
        mock_get_resp.content = b"fake_audio_bytes_1234567890_1234567890_1234567890_1234567890"
        mock_get.return_value = mock_get_resp

        mock_post_resp = MagicMock()
        mock_post_resp.status_code = 200
        mock_post_resp.json.return_value = {"text": "Bán đất 100m2 Cần Giờ giá 2 tỷ"}
        mock_post.return_value = mock_post_resp

        result = transcribe_voice_url(
            url="https://res.zalo.me/voice/note.m4a",
            groq_api_key="gsk_test_key",
        )
        self.assertEqual(result, "Bán đất 100m2 Cần Giờ giá 2 tỷ")


class TestServerVoiceIntegration(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    @patch("aioi.server.transcribe_voice_url")
    def test_chat_reply_voice_transcription_success(self, mock_stt):
        mock_stt.return_value = "Anh bán nhà 4 tầng hẻm 4m đường Huỳnh Tấn Phát quận 7 giá 5 tỷ"

        payload = {
            "external_user_id": "test_voice_user_1",
            "text": "[Khách gửi tin nhắn thoại/ghi âm]",
            "file_url": "https://res.zalo.me/voice/123.m4a",
            "file_name": "tin_nhan_thoai.m4a",
            "channel": "zalo_personal_test",
        }
        resp = self.client.post("/chat-reply", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(len(data["replies"]) > 0)
        mock_stt.assert_called_once()


if __name__ == "__main__":
    unittest.main()
