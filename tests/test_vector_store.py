import pytest
from aioi.vector_store import GeminiEmbedder, InMemoryVectorIndex, cosine_similarity

def test_cosine_similarity():
    v1 = [1.0, 0.0, 0.0]
    v2 = [1.0, 0.0, 0.0]
    assert cosine_similarity(v1, v2) == 1.0

    v3 = [0.0, 1.0, 0.0]
    assert cosine_similarity(v1, v3) == 0.0

def test_gemini_embedder_live():
    embedder = GeminiEmbedder()
    if not embedder.keys:
        pytest.skip("No GEMINI_API_KEYS set in environment")
    vec = embedder.embed_text("Cần tìm nhà phố hẻm xe hơi Quận 7 giá 5 tỷ")
    assert len(vec) == 3072

    index = InMemoryVectorIndex(embedder=embedder)
    index.add_document("doc1", "Bán nhà hẻm 6m Huỳnh Tấn Phát Q7, DT 4x14m, giá 5.2 tỷ", {"district": "Q7", "price": 5.2})
    index.add_document("doc2", "Cho thuê căn hộ Vinhomes Central Park Bình Thạnh 15 triệu", {"district": "Bình Thạnh", "price": 15})

    results = index.search("mua nhà hẻm xe hơi Huỳnh Tấn Phát quận 7 tầm 5 tỷ", top_k=1)
    assert len(results) == 1
    assert results[0]["id"] == "doc1"
    assert results[0]["score"] > 0.6
