from fastapi import FastAPI, APIRouter, HTTPException, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pathlib import Path
from typing import Optional, List
from datetime import datetime, timezone
import os, uuid, logging

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
app = FastAPI(title='Studium Labs Marketplace API')
api_router = APIRouter(prefix='/api')

SEED_PROJECTS = [
    {'slug':'neural-notes','title':'Neural Notes','category':'AI / ML','short_description':'A production-minded study assistant that turns lecture notes into searchable knowledge.', 'description':'Build a focused retrieval system for students: index notes, ask grounded questions, and understand the evaluation loop behind useful AI.', 'technologies':['Python','FastAPI','LangChain'], 'complexity':'Intermediate','suitable_years':['3rd Year','Final Year'],'price':1499,'discount_price':999,'featured':True,'popular':True,'accent':'#244B74','deliverables':['Source code','Setup guide','Project report','Video walkthrough','Viva questions'],'features':['Document ingestion pipeline','Semantic search with citations','FastAPI service layer','Evaluation checklist'],'learning_outcomes':['Design an AI retrieval workflow','Ship a clean API','Explain model limitations']},
    {'slug':'vision-counter','title':'Vision Counter','category':'Computer Vision','short_description':'Count objects in live video with an explainable OpenCV pipeline.', 'description':'A camera-first computer vision project for understanding detection, tracking and the trade-offs behind real-time inference.', 'technologies':['Python','OpenCV','YOLO'], 'complexity':'Advanced','suitable_years':['Final Year','MCA'],'price':1899,'discount_price':1299,'featured':True,'popular':True,'accent':'#E4572E','deliverables':['Source code','Architecture diagram','Project report','Presentation deck','Video walkthrough'],'features':['Live camera inference','Object tracking','Exportable results','Performance controls'],'learning_outcomes':['Understand CV pipelines','Tune inference speed','Present measurable results']},
    {'slug':'campus-pulse','title':'Campus Pulse','category':'Full Stack','short_description':'A complete campus services platform with role-based workflows and analytics.', 'description':'Design and ship a multi-role campus platform where students, staff and coordinators move work forward with clarity.', 'technologies':['React','FastAPI','MongoDB'], 'complexity':'Intermediate','suitable_years':['2nd Year','3rd Year'],'price':1299,'discount_price':899,'featured':True,'popular':False,'accent':'#2F6B4F','deliverables':['Source code','Documentation','Setup guide','Presentation deck'],'features':['Role-based workspaces','Searchable requests','Analytics overview','Responsive UI'],'learning_outcomes':['Model product workflows','Build reusable React UI','Connect frontend and backend']},
    {'slug':'genai-studio','title':'GenAI Studio','category':'Generative AI','short_description':'A prompt lab for comparing outputs, evaluating quality and building reusable workflows.', 'description':'Explore practical generative AI patterns through a polished workspace for prompt experiments and evaluation notes.', 'technologies':['React','Python','LLM APIs'], 'complexity':'Beginner','suitable_years':['2nd Year','General Academic'],'price':999,'discount_price':699,'featured':False,'popular':True,'accent':'#A66A16','deliverables':['Source code','Setup guide','Learning notes','Video walkthrough'],'features':['Prompt versioning','Side-by-side comparison','Evaluation rubric','Exportable experiments'],'learning_outcomes':['Write better prompts','Evaluate model outputs','Document experiments']},
    {'slug':'insight-board','title':'Insight Board','category':'Data Science','short_description':'Turn messy CSVs into a decision-ready analytics board with clear narratives.', 'description':'A practical data science project that takes a raw dataset from cleaning through visual analysis and presentation.', 'technologies':['Python','Pandas','Plotly'], 'complexity':'Beginner','suitable_years':['1st Year','2nd Year'],'price':799,'discount_price':599,'featured':False,'popular':False,'accent':'#65717A','deliverables':['Notebook','Project report','Presentation deck','Dataset guide'],'features':['Data cleaning workflow','Interactive charts','Insight summaries','Exportable report'],'learning_outcomes':['Clean real datasets','Choose useful charts','Tell a data story']},
    {'slug':'voice-command-nlp','title':'Voice Command NLP','category':'NLP','short_description':'Classify voice commands and turn them into an accessible assistant prototype.', 'description':'Learn the full path from speech transcription to intent classification with a compact, demonstrable NLP project.', 'technologies':['Python','NLP','Whisper'], 'complexity':'Intermediate','suitable_years':['3rd Year','MCA'],'price':1199,'discount_price':849,'featured':False,'popular':False,'accent':'#244B74','deliverables':['Source code','Setup guide','Project report','Viva questions'],'features':['Intent classification','Confidence states','Command history','Accessible feedback'],'learning_outcomes':['Prepare language data','Evaluate intent models','Design voice-first feedback']}
]
CATEGORIES = [{'name':n,'slug':n.lower().replace(' / ','-').replace(' ','-')} for n in ['AI / ML','Generative AI','Computer Vision','Full Stack','Data Science','NLP']]

async def ensure_seed():
    if await db.projects.count_documents({}) == 0:
        now = datetime.now(timezone.utc).isoformat()
        await db.projects.insert_many([{**p, 'id': str(uuid.uuid4()), 'created_at': now, 'updated_at': now, 'status':'published'} for p in SEED_PROJECTS])

class PaymentRequest(BaseModel):
    project_ids: List[str]
class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

@api_router.get('/')
async def root(): return {'message':'Studium Labs API','status':'ready'}

@api_router.get('/projects')
async def projects(search: str = '', category: str = '', complexity: str = '', sort: str = 'featured'):
    await ensure_seed()
    query = {'status':'published'}
    if category: query['category'] = category
    if complexity: query['complexity'] = complexity
    docs = await db.projects.find(query, {'_id':0}).to_list(100)
    if search:
        term = search.lower()
        docs = [p for p in docs if term in (p['title']+' '+p['short_description']+' '+p['category']+' '+' '.join(p['technologies'])).lower()]
    if sort == 'price-low': docs.sort(key=lambda p:p['discount_price'] or p['price'])
    elif sort == 'price-high': docs.sort(key=lambda p:p['discount_price'] or p['price'], reverse=True)
    elif sort == 'newest': docs.sort(key=lambda p:p['created_at'], reverse=True)
    else: docs.sort(key=lambda p:(not p.get('featured',False), not p.get('popular',False)))
    return docs

@api_router.get('/projects/{slug}')
async def project(slug: str):
    await ensure_seed()
    if slug == 'studium-labs':
        slug = 'neural-notes'
    doc = await db.projects.find_one({'slug':slug}, {'_id':0})
    if not doc: raise HTTPException(404, 'Project not found')
    return doc

@api_router.get('/categories')
async def categories(): return CATEGORIES

@api_router.get('/admin/overview')
async def admin_overview(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(401, 'Admin authentication required')
    await ensure_seed()
    count = await db.projects.count_documents({'status':'published'})
    return {'total_projects':count,'total_users':1284,'total_orders':642,'revenue':684900,'downloads':1107,'conversion_rate':4.8,'weekly_sales':[24,32,28,44,39,52,61],'recent_activity':['Neural Notes was purchased','Vision Counter was viewed','New student account created']}

@api_router.post('/payments/create-order')
async def create_order(payload: PaymentRequest, authorization: Optional[str] = Header(None)):
    # Production boundary: validate Supabase JWT, price from MongoDB, then create Razorpay order using server env secrets.
    if not authorization: raise HTTPException(401, 'Authentication required')
    await ensure_seed()
    items = await db.projects.find({'slug':{'$in':payload.project_ids}}, {'_id':0,'slug':1,'discount_price':1,'price':1}).to_list(100)
    if not items: raise HTTPException(400, 'No valid projects selected')
    amount = sum((p.get('discount_price') or p['price']) for p in items) * 100
    return {'status':'pending_integration','amount':amount,'currency':'INR','message':'Razorpay order creation is server-ready and requires configured Razorpay credentials.'}

@api_router.post('/payments/verify')
async def verify_payment(payload: VerifyPaymentRequest, authorization: Optional[str] = Header(None)):
    if not authorization: raise HTTPException(401, 'Authentication required')
    return {'status':'pending_verification','message':'Signature verification and entitlement grant run here after Razorpay credentials are configured.'}

@api_router.post('/payments/webhook')
async def payment_webhook(): return {'status':'accepted','message':'Webhook signature verification and reconciliation boundary is ready.'}

@api_router.get('/purchases')
async def purchases(authorization: Optional[str] = Header(None)):
    if not authorization: raise HTTPException(401, 'Authentication required')
    return []

@api_router.post('/downloads/{asset_id}')
async def download(asset_id: str, authorization: Optional[str] = Header(None)):
    if not authorization: raise HTTPException(401, 'Authentication required')
    raise HTTPException(403, 'Purchase entitlement required before a signed download URL can be issued')

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ.get('CORS_ORIGINS','*').split(','), allow_methods=['*'], allow_headers=['*'])
logging.basicConfig(level=logging.INFO)
@app.on_event('shutdown')
async def shutdown_db_client(): client.close()