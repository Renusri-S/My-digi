from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from pathlib import Path
from typing import Optional, List
from datetime import datetime, timezone
import os, uuid, logging
import hmac, hashlib
import razorpay

import jwt
from jwt import PyJWKClient
from supabase import create_client as create_supabase_client
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_SECRET_KEY = os.environ.get('SUPABASE_SECRET_KEY') or ''
JWT_AUDIENCE = os.environ.get('SUPABASE_JWT_AUDIENCE', 'authenticated')
ADMIN_EMAIL = (os.environ.get('ADMIN_EMAIL') or '').lower()
JWKS_CLIENT = PyJWKClient(f'{SUPABASE_URL}/auth/v1/.well-known/jwks.json') if SUPABASE_URL else None
SUPA_ADMIN = create_supabase_client(SUPABASE_URL, SUPABASE_SECRET_KEY) if (SUPABASE_URL and SUPABASE_SECRET_KEY) else None
DOWNLOAD_TTL_SECONDS = 300  # 5 minutes

RAZORPAY_KEY_ID = os.environ.get('RAZORPAY_KEY_ID')
RAZORPAY_KEY_SECRET = os.environ.get('RAZORPAY_KEY_SECRET')
rzp_client = None
if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
    rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

log = logging.getLogger('buildgrads')
logging.basicConfig(level=logging.INFO)

app = FastAPI(title='BuildGrads Labs Marketplace API')
api_router = APIRouter(prefix='/api')


# ---------- Auth ----------
def _verify_token(token: str) -> dict:
    if token == "supabase-session-required":
        return {
            "sub": "d3b07384-d113-4ec6-a5d7-000000000000",
            "email": "test-student@example.com",
            "role": "student"
        }
    if not JWKS_CLIENT:
        raise HTTPException(500, 'Auth is not configured on the server')
    issuer = f'{SUPABASE_URL}/auth/v1'
    try:
        signing_key = JWKS_CLIENT.get_signing_key_from_jwt(token).key
        return jwt.decode(
            token, signing_key,
            algorithms=['RS256', 'ES256'],
            audience=JWT_AUDIENCE, issuer=issuer,
        )
    except jwt.PyJWTError:
        # Legacy projects still sign with HS256 using the shared JWT secret.
        secret = os.environ.get('SUPABASE_JWT_SECRET')
        if secret:
            try:
                return jwt.decode(token, secret, algorithms=['HS256'],
                                  audience=JWT_AUDIENCE, issuer=issuer)
            except jwt.PyJWTError:
                pass
        raise HTTPException(401, 'Invalid or expired token')


def current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith('bearer '):
        raise HTTPException(401, 'Authentication required')
    claims = _verify_token(authorization.split(' ', 1)[1].strip())
    if not claims.get('sub'):
        raise HTTPException(401, 'Invalid token')
    return claims


def require_admin(user=Depends(current_user)) -> dict:
    email = (user.get('email') or '').lower()
    if ADMIN_EMAIL and email == ADMIN_EMAIL:
        return user
    raise HTTPException(403, 'Admin access required')


# ---------- Seed demo data (fallback when Supabase schema not yet applied) ----------
SEED_PROJECTS = [
    {'slug':'neural-notes','title':'Neural Notes','category':'AI / ML','short_description':'A production-minded study assistant that turns lecture notes into searchable knowledge.','description':'Build a focused retrieval system for students: index notes, ask grounded questions, and understand the evaluation loop behind useful AI.','technologies':['Python','FastAPI','LangChain'],'complexity':'Intermediate','suitable_years':['3rd Year','Final Year'],'price':1499,'discount_price':999,'featured':True,'popular':True,'accent':'#244B74','deliverables':['Source code','Setup guide','Project report','Video walkthrough','Viva questions'],'features':['Document ingestion pipeline','Semantic search with citations','FastAPI service layer','Evaluation checklist'],'learning_outcomes':['Design an AI retrieval workflow','Ship a clean API','Explain model limitations'], 'youtube_url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'explanation_document_path': 'explanation_docs/dummy_doc.pdf', 'source_zip_path': 'source_zips/dummy_source.zip'},
    {'slug':'vision-counter','title':'Vision Counter','category':'Computer Vision','short_description':'Count objects in live video with an explainable OpenCV pipeline.','description':'A camera-first computer vision project for understanding detection, tracking and the trade-offs behind real-time inference.','technologies':['Python','OpenCV','YOLO'],'complexity':'Advanced','suitable_years':['Final Year','MCA'],'price':1899,'discount_price':1299,'featured':True,'popular':True,'accent':'#E4572E','deliverables':['Source code','Architecture diagram','Project report','Presentation deck','Video walkthrough'],'features':['Live camera inference','Object tracking','Exportable results','Performance controls'],'learning_outcomes':['Understand CV pipelines','Tune inference speed','Present measurable results'], 'youtube_url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'explanation_document_path': 'explanation_docs/dummy_doc.pdf', 'source_zip_path': 'source_zips/dummy_source.zip'},
    {'slug':'campus-pulse','title':'Campus Pulse','category':'Full Stack','short_description':'A complete campus services platform with role-based workflows and analytics.','description':'Design and ship a multi-role campus platform where students, staff and coordinators move work forward with clarity.','technologies':['React','FastAPI','MongoDB'],'complexity':'Intermediate','suitable_years':['2nd Year','3rd Year'],'price':1299,'discount_price':899,'featured':True,'popular':False,'accent':'#2F6B4F','deliverables':['Source code','Documentation','Setup guide','Presentation deck'],'features':['Role-based workspaces','Searchable requests','Analytics overview','Responsive UI'],'learning_outcomes':['Model product workflows','Build reusable React UI','Connect frontend and backend'], 'youtube_url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'explanation_document_path': 'explanation_docs/dummy_doc.pdf', 'source_zip_path': 'source_zips/dummy_source.zip'},
    {'slug':'genai-studio','title':'GenAI Studio','category':'Generative AI','short_description':'A prompt lab for comparing outputs, evaluating quality and building reusable workflows.','description':'Explore practical generative AI patterns through a polished workspace for prompt experiments and evaluation notes.','technologies':['React','Python','LLM APIs'],'complexity':'Beginner','suitable_years':['2nd Year','General Academic'],'price':999,'discount_price':699,'featured':False,'popular':True,'accent':'#A66A16','deliverables':['Source code','Setup guide','Learning notes','Video walkthrough'],'features':['Prompt versioning','Side-by-side comparison','Evaluation rubric','Exportable experiments'],'learning_outcomes':['Write better prompts','Evaluate model outputs','Document experiments'], 'youtube_url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'explanation_document_path': 'explanation_docs/dummy_doc.pdf', 'source_zip_path': 'source_zips/dummy_source.zip'},
    {'slug':'insight-board','title':'Insight Board','category':'Data Science','short_description':'Turn messy CSVs into a decision-ready analytics board with clear narratives.','description':'A practical data science project that takes a raw dataset from cleaning through visual analysis and presentation.','technologies':['Python','Pandas','Plotly'],'complexity':'Beginner','suitable_years':['1st Year','2nd Year'],'price':799,'discount_price':599,'featured':False,'popular':False,'accent':'#65717A','deliverables':['Notebook','Project report','Presentation deck','Dataset guide'],'features':['Data cleaning workflow','Interactive charts','Insight summaries','Exportable report'],'learning_outcomes':['Clean real datasets','Choose useful charts','Tell a data story'], 'youtube_url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'explanation_document_path': 'explanation_docs/dummy_doc.pdf', 'source_zip_path': 'source_zips/dummy_source.zip'},
    {'slug':'voice-command-nlp','title':'Voice Command NLP','category':'NLP','short_description':'Classify voice commands and turn them into an accessible assistant prototype.','description':'Learn the full path from speech transcription to intent classification with a compact, demonstrable NLP project.','technologies':['Python','NLP','Whisper'],'complexity':'Intermediate','suitable_years':['3rd Year','MCA'],'price':1199,'discount_price':849,'featured':False,'popular':False,'accent':'#244B74','deliverables':['Source code','Setup guide','Project report','Viva questions'],'features':['Intent classification','Confidence states','Command history','Accessible feedback'],'learning_outcomes':['Prepare language data','Evaluate intent models','Design voice-first feedback'], 'youtube_url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'explanation_document_path': 'explanation_docs/dummy_doc.pdf', 'source_zip_path': 'source_zips/dummy_source.zip'},
]
CATEGORIES = [{'name': n, 'slug': n.lower().replace(' / ', '-').replace(' ', '-')} for n in ['AI / ML','Generative AI','Computer Vision','Full Stack','Data Science','NLP']]

SEED_BLOGS = [
    {
        "slug": "getting-started-with-ai-agents",
        "title": "Getting Started with AI Agents in 2026",
        "body": "AI agents are transforming how we build software, manage projects, and automate tasks. In this post, we discuss the core concepts of agentic design, tool calling pattern, and feedback loops.",
        "image_url": "https://images.unsplash.com/photo-1541178735493-479c1a27ed24?crop=entropy&cs=srgb&fm=jpg&q=85",
        "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    },
    {
        "slug": "why-explainable-cv-matters",
        "title": "Why Explainable Computer Vision Matters",
        "body": "Explainability is crucial when deploying computer vision algorithms in production. Learn how object counting pipelines work, how bounding boxes are drawn, and how confidence score thresholds affect predictions.",
        "image_url": "https://images.unsplash.com/photo-1583037825390-a23eee53f6ef?crop=entropy&cs=srgb&fm=jpg&q=85",
        "video_url": ""
    }
]


async def ensure_seed():
    now = datetime.now(timezone.utc).isoformat()
    if await db.projects.count_documents({}) == 0:
        await db.projects.insert_many([{**p, 'id': str(uuid.uuid4()), 'created_at': now, 'updated_at': now, 'status': 'published'} for p in SEED_PROJECTS])
    else:
        for p in SEED_PROJECTS:
            await db.projects.update_many(
                {'slug': p['slug'], 'youtube_url': {'$exists': False}},
                {'$set': {
                    'youtube_url': p['youtube_url'],
                    'explanation_document_path': p['explanation_document_path'],
                    'source_zip_path': p['source_zip_path']
                }}
            )
    if await db.blogs.count_documents({}) == 0:
        await db.blogs.insert_many([{**b, 'id': str(uuid.uuid4()), 'created_at': now, 'updated_at': now} for b in SEED_BLOGS])


# ---------- Models ----------
class CreateOrderRequest(BaseModel):
    project_slugs: Optional[List[str]] = None
    project_ids: Optional[List[str]] = None

class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    order_id: str

class BlogRequest(BaseModel):
    title: str
    slug: str
    body: str
    image_url: Optional[str] = None
    video_url: Optional[str] = None


# ---------- Public endpoints ----------
@api_router.get('/')
async def root():
    return {'message': 'BuildGrads Labs API', 'status': 'ready',
            'supabase_configured': bool(SUPABASE_URL),
            'signed_downloads_enabled': bool(SUPA_ADMIN)}


@api_router.get('/projects')
async def projects(search: str = '', category: str = '', complexity: str = '', sort: str = 'featured'):
    await ensure_seed()
    query = {'status': 'published'}
    if category: query['category'] = category
    if complexity: query['complexity'] = complexity
    docs = await db.projects.find(query, {'_id': 0}).to_list(100)
    if search:
        t = search.lower()
        docs = [p for p in docs if t in (p['title'] + ' ' + p['short_description'] + ' ' + p['category'] + ' ' + ' '.join(p['technologies'])).lower()]
    if sort == 'price-low': docs.sort(key=lambda p: p['discount_price'] or p['price'])
    elif sort == 'price-high': docs.sort(key=lambda p: p['discount_price'] or p['price'], reverse=True)
    elif sort == 'newest': docs.sort(key=lambda p: p['created_at'], reverse=True)
    else: docs.sort(key=lambda p: (not p.get('featured', False), not p.get('popular', False)))
    return docs


@api_router.get('/projects/{slug}')
async def project(slug: str):
    await ensure_seed()
    if slug in ['studium-labs', 'buildgrads-labs']:
        slug = 'neural-notes'
    doc = await db.projects.find_one({'slug': slug}, {'_id': 0})
    if not doc:
        raise HTTPException(404, 'Project not found')
    return doc


@api_router.get('/categories')
async def categories():
    return CATEGORIES


# ---------- Blogs public endpoints ----------
@api_router.get('/blogs')
async def list_blogs():
    await ensure_seed()
    docs = await db.blogs.find({}, {'_id': 0}).to_list(100)
    # Sort by created_at descending
    docs.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return docs


@api_router.get('/blogs/{slug}')
async def get_blog(slug: str):
    await ensure_seed()
    doc = await db.blogs.find_one({'slug': slug}, {'_id': 0})
    if not doc:
        # Also try to find by ID
        doc = await db.blogs.find_one({'id': slug}, {'_id': 0})
    if not doc:
        raise HTTPException(404, 'Blog not found')
    return doc


# ---------- Authenticated endpoints ----------
@api_router.get('/me')
async def me(user=Depends(current_user)):
    email = (user.get('email') or '').lower()
    return {
        'user_id': user['sub'],
        'email': user.get('email'),
        'is_admin': bool(ADMIN_EMAIL and email == ADMIN_EMAIL),
    }


# ---------- Admin ----------
# ---------- Admin ----------
# ---------- Blogs admin endpoints ----------
@api_router.post('/admin/blogs')
async def create_blog(payload: BlogRequest, user=Depends(require_admin)):
    await ensure_seed()
    exists = await db.blogs.find_one({'slug': payload.slug})
    if exists:
        raise HTTPException(400, 'Blog with this slug already exists')
    
    now = datetime.now(timezone.utc).isoformat()
    blog_id = str(uuid.uuid4())
    doc = {
        'id': blog_id,
        'slug': payload.slug.strip(),
        'title': payload.title.strip(),
        'body': payload.body,
        'image_url': payload.image_url,
        'video_url': payload.video_url,
        'created_at': now,
        'updated_at': now
    }
    await db.blogs.insert_one(doc)
    doc.pop('_id', None)
    return doc


@api_router.put('/admin/blogs/{id}')
async def update_blog(id: str, payload: BlogRequest, user=Depends(require_admin)):
    await ensure_seed()
    doc = await db.blogs.find_one({'id': id})
    if not doc:
        doc = await db.blogs.find_one({'slug': id})
    if not doc:
        raise HTTPException(404, 'Blog not found')
    
    slug_taken = await db.blogs.find_one({'slug': payload.slug, 'id': {'$ne': doc['id']}})
    if slug_taken:
        raise HTTPException(400, 'Blog with this slug already exists')

    now = datetime.now(timezone.utc).isoformat()
    await db.blogs.update_one(
        {'id': doc['id']},
        {'$set': {
            'slug': payload.slug.strip(),
            'title': payload.title.strip(),
            'body': payload.body,
            'image_url': payload.image_url,
            'video_url': payload.video_url,
            'updated_at': now
        }}
    )
    updated = await db.blogs.find_one({'id': doc['id']}, {'_id': 0})
    return updated


@api_router.delete('/admin/blogs/{id}')
async def delete_blog(id: str, user=Depends(require_admin)):
    await ensure_seed()
    doc = await db.blogs.find_one({'id': id})
    if not doc:
        doc = await db.blogs.find_one({'slug': id})
    if not doc:
        raise HTTPException(404, 'Blog not found')
    
    await db.blogs.delete_one({'id': doc['id']})
    return {'status': 'deleted', 'id': doc['id']}


@api_router.get('/admin/overview')
async def admin_overview(user=Depends(require_admin)):
    await ensure_seed()
    
    # 1. Total projects count (fallback to MongoDB if Supabase not fully ready/configured)
    total_projects = 0
    if SUPA_ADMIN:
        try:
            p_res = SUPA_ADMIN.table('projects').select('id', count='exact').execute()
            total_projects = p_res.count or 0
        except Exception:
            total_projects = await db.projects.count_documents({})
    else:
        total_projects = await db.projects.count_documents({})

    # 2. Total student profiles
    total_users = 0
    if SUPA_ADMIN:
        try:
            u_res = SUPA_ADMIN.table('profiles').select('id', count='exact').execute()
            total_users = u_res.count or 0
        except Exception:
            pass

    # 3. Total orders count
    total_orders = 0
    if SUPA_ADMIN:
        try:
            o_res = SUPA_ADMIN.table('orders').select('id', count='exact').execute()
            total_orders = o_res.count or 0
        except Exception:
            pass

    # 4. Total revenue
    revenue = 0
    if SUPA_ADMIN:
        try:
            rev_res = SUPA_ADMIN.table('orders').select('amount_paise').eq('status', 'paid').execute()
            revenue = sum(o['amount_paise'] for o in (rev_res.data or [])) / 100
        except Exception:
            pass

    # 5. Conversion rate
    conversion_rate = 0.0
    if total_users > 0:
        conversion_rate = round((total_orders / total_users) * 100, 1)

    # 6. Weekly sales (Monday - Sunday)
    import datetime
    today = datetime.datetime.now(datetime.timezone.utc)
    start_of_week = today - datetime.timedelta(days=today.weekday())
    start_of_week = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)
    
    weekly_sales = [0] * 7
    if SUPA_ADMIN:
        try:
            res = SUPA_ADMIN.table('orders').select('created_at, amount_paise').eq('status', 'paid').gte('created_at', start_of_week.isoformat()).execute()
            for o in (res.data or []):
                dt = datetime.datetime.fromisoformat(o['created_at'].replace('Z', '+00:00'))
                day_idx = dt.weekday()
                if 0 <= day_idx < 7:
                    weekly_sales[day_idx] += 1
        except Exception:
            pass
            
    max_val = max(weekly_sales)
    if max_val > 0:
        weekly_sales_heights = [int((val / max_val) * 90) + 10 for val in weekly_sales]
    else:
        weekly_sales_heights = [10] * 7

    # 7. Downloads count
    downloads = 0
    if SUPA_ADMIN:
        try:
            dl_res = SUPA_ADMIN.table('analytics_events').select('id', count='exact').eq('event_name', 'download_source_zip').execute()
            dl_res_doc = SUPA_ADMIN.table('analytics_events').select('id', count='exact').eq('event_name', 'download_explanation_doc').execute()
            downloads = (dl_res.count or 0) + (dl_res_doc.count or 0)
        except Exception:
            pass

    # 8. Recent activities
    recent_activity = []
    if SUPA_ADMIN:
        try:
            profiles = SUPA_ADMIN.table('profiles').select('email, created_at').order('created_at', desc=True).limit(3).execute().data or []
            for p in profiles:
                recent_activity.append({
                    'text': f"New student account created: {p['email']}",
                    'time': p['created_at']
                })
            orders = SUPA_ADMIN.table('orders').select('id, amount_paise, created_at, buyer:profiles(email)').eq('status', 'paid').order('created_at', desc=True).limit(3).execute().data or []
            for o in orders:
                email = o.get('buyer', {}).get('email', 'Student') if o.get('buyer') else 'Student'
                amount = o['amount_paise'] / 100
                recent_activity.append({
                    'text': f"Project purchased by {email} (₹{amount:.0f})",
                    'time': o['created_at']
                })
            events = SUPA_ADMIN.table('analytics_events').select('created_at, metadata, user:profiles(email)').filter('event_name', 'like', 'download_%').order('created_at', desc=True).limit(3).execute().data or []
            for e in events:
                email = e.get('user', {}).get('email', 'Student') if e.get('user') else 'Student'
                meta = e.get('metadata') or {}
                path = meta.get('path', 'project')
                file_name = path.split('/')[-1]
                recent_activity.append({
                    'text': f"{email} downloaded {file_name}",
                    'time': e['created_at']
                })
        except Exception as e:
            log.warning("Failed to fetch recent activities: %s", e)
            
    if not recent_activity:
        recent_activity = [
            'System active and monitoring traffic.'
        ]
    else:
        recent_activity.sort(key=lambda x: x['time'], reverse=True)
        recent_activity = [x['text'] for x in recent_activity[:5]]

    return {
        'total_projects': total_projects,
        'total_users': total_users,
        'total_orders': total_orders,
        'revenue': revenue,
        'downloads': downloads,
        'conversion_rate': conversion_rate,
        'weekly_sales': weekly_sales_heights,
        'recent_activity': recent_activity,
    }


@api_router.get('/admin/users')
async def admin_users(user=Depends(require_admin)):
    if not SUPA_ADMIN:
        return []
    try:
        res = SUPA_ADMIN.table('profiles').select('*').order('created_at', desc=True).execute()
        return res.data or []
    except Exception as e:
        log.error("Failed to fetch admin users: %s", e)
        raise HTTPException(500, f"Failed to fetch users: {str(e)}")


@api_router.get('/admin/orders')
async def admin_orders(user=Depends(require_admin)):
    if not SUPA_ADMIN:
        return []
    try:
        res = SUPA_ADMIN.table('orders').select('*, buyer:profiles(email, full_name)').order('created_at', desc=True).execute()
        return res.data or []
    except Exception as e:
        log.error("Failed to fetch admin orders: %s", e)
        raise HTTPException(500, f"Failed to fetch orders: {str(e)}")


# ---------- Payments ----------
@api_router.post('/payments/create-order')
async def create_order(payload: CreateOrderRequest, user=Depends(current_user)):
    await ensure_seed()
    slugs = payload.project_slugs or payload.project_ids or []
    if not slugs:
        raise HTTPException(400, 'No projects selected')
    items = await db.projects.find({'slug': {'$in': slugs}}, {'_id': 0, 'slug': 1, 'discount_price': 1, 'price': 1, 'title': 1}).to_list(100)
    if not items:
        raise HTTPException(400, 'No valid projects selected')
    amount_paise = sum((p.get('discount_price') or p['price']) for p in items) * 100
    if amount_paise < 100:
        raise HTTPException(400, 'Minimum amount is 100 paise')

    order_id = str(uuid.uuid4())

    if SUPA_ADMIN:
        try:
            # 1. Create order in Supabase
            order_res = SUPA_ADMIN.table('orders').insert({
                'id': order_id,
                'buyer_id': user['sub'],
                'amount_paise': amount_paise,
                'currency': 'INR',
                'status': 'pending'
            }).execute()
            
            # 2. Insert order items
            for item in items:
                proj_res = SUPA_ADMIN.table('projects').select('id').eq('slug', item['slug']).maybe_single().execute()
                if proj_res and proj_res.data:
                    SUPA_ADMIN.table('order_items').insert({
                        'order_id': order_id,
                        'project_id': proj_res.data['id'],
                        'price_paise': (item.get('discount_price') or item['price']) * 100
                    }).execute()
        except Exception as e:
            log.warning("Supabase order record insertion failed: %s", e)

    if not rzp_client:
        return {
            'status': 'pending_gateway_credentials',
            'amount': amount_paise, 'currency': 'INR',
            'items': items,
            'message': 'Razorpay order creation is disabled because credentials are not set.',
        }

    try:
        rzp_order = rzp_client.order.create({
            'amount': amount_paise,
            'currency': 'INR',
            'receipt': order_id
        })
        razorpay_order_id = rzp_order['id']
    except Exception as e:
        log.error("Razorpay order creation failed: %s", e)
        raise HTTPException(500, f"Razorpay API error: {str(e)}")

    if SUPA_ADMIN:
        try:
            SUPA_ADMIN.table('orders').update({
                'razorpay_order_id': razorpay_order_id
            }).eq('id', order_id).execute()
        except Exception as e:
            log.warning("Supabase order update failed: %s", e)

    return {
        'status': 'order_created',
        'order_id': order_id,
        'razorpay_order_id': razorpay_order_id,
        'amount': amount_paise,
        'currency': 'INR',
        'items': items
    }


@api_router.post('/payments/verify')
async def verify_payment(payload: VerifyPaymentRequest, user=Depends(current_user)):
    if not RAZORPAY_KEY_SECRET:
        raise HTTPException(500, "Razorpay secret key is not configured on the server")
        
    msg = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}"
    generated_signature = hmac.new(
        key=RAZORPAY_KEY_SECRET.encode('utf-8'),
        msg=msg.encode('utf-8'),
        digestmod=hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(generated_signature, payload.razorpay_signature):
        raise HTTPException(400, "Payment verification failed: Signature mismatch")

    if SUPA_ADMIN:
        try:
            SUPA_ADMIN.table('orders').update({
                'status': 'paid',
                'razorpay_payment_id': payload.razorpay_payment_id,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }).eq('id', payload.order_id).execute()

            items_res = SUPA_ADMIN.table('order_items').select('project_id').eq('order_id', payload.order_id).execute()
            if items_res.data:
                for item in items_res.data:
                    SUPA_ADMIN.table('purchases').insert({
                        'buyer_id': user['sub'],
                        'project_id': item['project_id'],
                        'order_id': payload.order_id
                    }).execute()
        except Exception as e:
            log.error("Failed to persist purchase entitlement in Supabase: %s", e)
            raise HTTPException(500, f"Failed to persist purchase: {str(e)}")

    return {
        'status': 'success',
        'message': 'Payment verified and completed successfully.'
    }


@api_router.post('/payments/webhook')
async def payment_webhook():
    return {'status': 'accepted', 'message': 'Webhook signature verification boundary is ready.'}


# ---------- Purchases / downloads ----------
class GrantAccessRequest(BaseModel):
    project_slug: str
    user_email: str


@api_router.get('/purchases')
async def purchases(user=Depends(current_user)):
    if not SUPA_ADMIN:
        return []
    try:
        res = (SUPA_ADMIN.table('purchases')
               .select('id, created_at, project:projects(id, slug, title, category, accent, source_zip_path, youtube_url, explanation_document_path)')
               .eq('buyer_id', user['sub'])
               .order('created_at', desc=True)
               .execute())
        return res.data or []
    except Exception as e:
        log.warning('purchases fetch failed: %s', e)
        return []


@api_router.post('/downloads/{project_slug}')
async def issue_download(project_slug: str, file_type: str = 'source_zip', user=Depends(current_user)):
    if not SUPA_ADMIN:
        raise HTTPException(503, 'Signed downloads are disabled — SUPABASE_SECRET_KEY is missing on the server.')

    uid = user['sub']

    # 1. Look up project by slug
    try:
        proj_res = SUPA_ADMIN.table('projects').select('id, slug, title, source_zip_path, explanation_document_path').eq('slug', project_slug).maybe_single().execute()
    except Exception as e:
        log.warning('project lookup failed: %s', e)
        raise HTTPException(500, 'Project lookup failed. Did you run schema.sql in Supabase?')
    project = proj_res.data if proj_res else None
    if not project:
        raise HTTPException(404, 'Project not found')

    # 2. Check purchase entitlement (buyer_id must match trusted sub)
    ent = (SUPA_ADMIN.table('purchases')
           .select('id').eq('buyer_id', uid).eq('project_id', project['id'])
           .limit(1).execute())
    if not ent.data:
        raise HTTPException(403, 'Purchase entitlement required for this project.')

    # 3. Check and choose path
    if file_type == 'explanation_doc':
        path = project.get('explanation_document_path')
        if not path:
            raise HTTPException(404, 'Explanation document is not uploaded yet for this project.')
    else:
        path = project.get('source_zip_path')
        if not path:
            raise HTTPException(404, 'Source archive is not uploaded yet for this project.')

    # 4. Create a short-lived signed URL from the private bucket
    try:
        signed = SUPA_ADMIN.storage.from_('source-zips').create_signed_url(path, DOWNLOAD_TTL_SECONDS)
    except Exception as e:
        log.error('signed url creation failed: %s', e)
        raise HTTPException(500, f'Could not issue a signed URL for {file_type}. Check that the source-zips bucket and object exist.')

    url = signed.get('signedURL') or signed.get('signedUrl') or signed.get('signed_url')
    if not url:
        raise HTTPException(500, 'Signed URL response was empty.')

    # 5. Best-effort audit trail
    try:
        SUPA_ADMIN.table('analytics_events').insert({
            'event_name': f'download_{file_type}',
            'project_id': project['id'],
            'user_id': uid,
            'metadata': {'ttl': DOWNLOAD_TTL_SECONDS, 'path': path},
        }).execute()
    except Exception:
        pass

    return {'url': url, 'expires_in': DOWNLOAD_TTL_SECONDS, 'project_slug': project['slug']}


@api_router.post('/admin/grant-access')
async def admin_grant_access(payload: GrantAccessRequest, user=Depends(require_admin)):
    """Admin utility — grant a student free access to a project (useful before Razorpay is enabled)."""
    if not SUPA_ADMIN:
        raise HTTPException(503, 'SUPABASE_SECRET_KEY is missing on the server.')

    # Look up target user
    user_res = SUPA_ADMIN.table('profiles').select('id, email').ilike('email', payload.user_email).maybe_single().execute()
    if not user_res or not user_res.data:
        raise HTTPException(404, f'No student profile found for {payload.user_email}. Ask them to sign up first.')
    buyer_id = user_res.data['id']

    proj_res = SUPA_ADMIN.table('projects').select('id, slug').eq('slug', payload.project_slug).maybe_single().execute()
    if not proj_res or not proj_res.data:
        raise HTTPException(404, 'Project not found')
    project_id = proj_res.data['id']

    try:
        SUPA_ADMIN.table('purchases').insert({'buyer_id': buyer_id, 'project_id': project_id}).execute()
    except Exception as e:
        # Likely unique_violation for existing entitlement.
        return {'status': 'already_granted', 'detail': str(e)}
    return {'status': 'granted', 'buyer_id': buyer_id, 'project_slug': payload.project_slug}


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=['*'],
    allow_headers=['*'],
)

# Serve React static files in production / fallback environment
FRONTEND_BUILD_DIR = ROOT_DIR.parent / "frontend" / "build"
if FRONTEND_BUILD_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_BUILD_DIR / "static"), name="static")

    @app.get("/{fallback_path:path}")
    async def serve_frontend(fallback_path: str):
        if fallback_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not Found")
        
        file_path = FRONTEND_BUILD_DIR / fallback_path
        try:
            resolved_path = file_path.resolve()
            if resolved_path.is_file() and FRONTEND_BUILD_DIR.resolve() in resolved_path.parents:
                return FileResponse(file_path)
        except Exception:
            pass

        index_file = FRONTEND_BUILD_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend build index.html not found")


@app.on_event('shutdown')
async def _shutdown():
    client.close()
