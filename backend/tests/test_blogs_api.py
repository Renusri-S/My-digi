import os, requests, pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

@pytest.fixture(scope="module")
def client():
    return requests.Session()

def test_blogs_list(client):
    r = client.get(f"{BASE_URL}/api/blogs", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 2
    assert {"slug", "title", "body", "image_url", "video_url", "created_at"}.issubset(data[0])

def test_blog_detail(client):
    r = client.get(f"{BASE_URL}/api/blogs/getting-started-with-ai-agents", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["title"] == "Getting Started with AI Agents in 2026"
    
    r = client.get(f"{BASE_URL}/api/blogs/non-existent-slug-1234", timeout=15)
    assert r.status_code == 404

def test_admin_blogs_requires_auth(client):
    # Test POST
    r = client.post(f"{BASE_URL}/api/admin/blogs", json={
        "slug": "test-blog",
        "title": "Test Title",
        "body": "Test Body"
    }, timeout=15)
    assert r.status_code == 401

    # Test PUT
    r = client.put(f"{BASE_URL}/api/admin/blogs/some-id", json={
        "slug": "test-blog",
        "title": "Test Title",
        "body": "Test Body"
    }, timeout=15)
    assert r.status_code == 401

    # Test DELETE
    r = client.delete(f"{BASE_URL}/api/admin/blogs/some-id", timeout=15)
    assert r.status_code == 401

def test_admin_blogs_forbidden_for_student(client):
    headers = {"Authorization": "Bearer supabase-session-required"}
    r = client.post(f"{BASE_URL}/api/admin/blogs", json={
        "slug": "test-blog",
        "title": "Test Title",
        "body": "Test Body"
    }, headers=headers, timeout=15)
    assert r.status_code == 403
