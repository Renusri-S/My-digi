import os, requests, pytest
BASE_URL=os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

@pytest.fixture(scope="module")
def client():
    return requests.Session()

def test_projects_seed_and_shape(client):
    r=client.get(f"{BASE_URL}/api/projects",timeout=15)
    assert r.status_code == 200
    data=r.json(); assert len(data)==6
    assert {"slug","title","price","category"}.issubset(data[0])

def test_project_detail(client):
    r=client.get(f"{BASE_URL}/api/projects/studium-labs",timeout=15)
    assert r.status_code == 404
    r=client.get(f"{BASE_URL}/api/projects/neural-notes",timeout=15)
    assert r.status_code == 200 and r.json()["slug"]=="neural-notes"

def test_search_filter_sort(client):
    r=client.get(f"{BASE_URL}/api/projects",params={"search":"opencv"},timeout=15)
    assert r.status_code==200 and len(r.json())==1
    r=client.get(f"{BASE_URL}/api/projects",params={"category":"NLP","sort":"price-low"},timeout=15)
    assert r.status_code==200 and len(r.json())==1

def test_payment_requires_auth(client):
    r=client.post(f"{BASE_URL}/api/payments/create-order",json={"project_ids":["neural-notes"]},timeout=15)
    assert r.status_code==401

def test_payment_is_pending_boundary_with_header(client):
    r=client.post(f"{BASE_URL}/api/payments/create-order",json={"project_ids":["neural-notes"]},headers={"Authorization":"Bearer supabase-session-required"},timeout=15)
    assert r.status_code==200 and r.json()["status"]=="pending_integration"

def test_protected_purchases(client):
    r=client.get(f"{BASE_URL}/api/purchases",timeout=15)
    assert r.status_code==401
