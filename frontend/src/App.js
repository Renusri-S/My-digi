/* eslint-disable react/no-unescaped-entities */
import { useEffect, useMemo, useState } from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams, Navigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BarChart3, BookOpen, ChevronDown, ChevronRight, CircleHelp, Filter, LayoutDashboard, LogOut, Menu, Play, Plus, Search, ShieldCheck, ShoppingBag, Sparkles, Trash2, User, X, Zap } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { supabase, supabaseEnabled } from '@/lib/supabase';
import { listProjects, getProject, listUserPurchases, hasPurchased, upsertProject, deleteProject } from '@/lib/projectsRepo';
import { apiGet, apiPost } from '@/lib/api';

const money = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

function getYoutubeEmbedUrl(url) {
  if (!url) return null;
  let videoId = '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    videoId = match[2];
  } else {
    return url;
  }
  return `https://www.youtube.com/embed/${videoId}`;
}

async function startDownload(slug, fileType = 'source_zip') {
  try {
    const { data } = await apiPost(`/downloads/${slug}?file_type=${fileType}`, {});
    if (data?.url) {
      window.open(data.url, '_blank', 'noopener');
      toast.success(`${fileType === 'explanation_doc' ? 'Explanation document' : 'Source zip'} download link ready`);
    }
    else toast.error('Could not create a signed link.');
  } catch (e) {
    const msg = e?.response?.data?.detail || e?.message || 'Download failed';
    toast.error(msg);
  }
}

// ---------- Data hooks ----------
function useProjects(filters) {
  const key = JSON.stringify(filters);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    listProjects(filters).then((r) => setData(r || [])).catch(() => setData([])).finally(() => setLoading(false));
     
  }, [key]);
  return { data, loading };
}

function usePurchases() {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) { setData([]); setLoading(false); return; }
    listUserPurchases(user.id).then((r) => setData(r || [])).finally(() => setLoading(false));
  }, [user]);
  return { data, loading };
}

// ---------- Layout ----------
function Nav({ cartCount }) {
  const [open, setOpen] = useState(false);
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="nav" data-testid="site-navigation">
      <div className="nav-inner">
        <Link to="/" className="brand" data-testid="brand-home">
          <span className="brand-mark">S</span><span>studium<span className="brand-dot">.</span></span>
        </Link>
        <nav className={`desktop-links ${open ? 'mobile-open' : ''}`} data-testid="primary-navigation">
          <Link to="/projects" data-testid="nav-projects">Projects</Link>
          <a href="/#categories" data-testid="nav-categories">Categories</a>
          <a href="/#how-it-works" data-testid="nav-how-it-works">How it works</a>
          <a href="/#about" data-testid="nav-about">About</a>
          {isAdmin && <Link to="/admin" data-testid="nav-admin">Admin</Link>}
        </nav>
        <div className="nav-actions">
          <Link to="/projects" className="icon-link search-link" aria-label="Search projects" data-testid="nav-search"><Search size={18} /></Link>
          <Link to="/cart" className="cart-link" data-testid="nav-cart">
            <ShoppingBag size={18} /><span>Cart</span>{cartCount > 0 && <b data-testid="cart-count">{cartCount}</b>}
          </Link>
          {user ? (
            <>
              <Link to="/dashboard" className="nav-login" data-testid="nav-dashboard"><User size={15} /> {user.email?.split('@')[0]}</Link>
              <button className="nav-login" onClick={async () => { await signOut(); toast('Signed out'); navigate('/'); }} data-testid="nav-signout" style={{ background: 'none', border: 0 }}><LogOut size={15} /></button>
            </>
          ) : (
            <Link to="/login" className="nav-login" data-testid="nav-login">Log in <ArrowRight size={15} /></Link>
          )}
          <button className="mobile-menu" onClick={() => setOpen(!open)} aria-label="Open navigation" data-testid="mobile-menu-button">{open ? <X /> : <Menu />}</button>
        </div>
      </div>
    </header>
  );
}

function Shell({ children, cartCount = 0 }) {
  return (<><Nav cartCount={cartCount} />{children}<Toaster position="bottom-right" /></>);
}

// ---------- Project card ----------
function ProjectCard({ project, onAdd }) {
  return (
    <article className="project-card" data-testid={`project-card-${project.slug}`}>
      <div className="project-visual" style={{ '--accent': project.accent || '#244B74' }}>
        <div className="visual-grid"></div>
        <span className="card-index">{project.category}</span>
        <span className="visual-code">{(project.technologies || []).slice(0, 2).join(' / ')}</span>
        <div className="visual-icon"><Zap size={24} /></div>
      </div>
      <div className="project-body">
        <div className="meta-row">
          <span className="eyebrow">{project.complexity}</span>
          <span className="year-label">{(project.suitable_years || [])[0]}</span>
        </div>
        <Link to={`/projects/${project.slug}`} className="project-title" data-testid={`project-title-${project.slug}`}>{project.title}<ChevronRight size={17} /></Link>
        <p>{project.short_description}</p>
        <div className="tag-row">{(project.technologies || []).map(t => <span key={t} className="tech-tag" data-testid={`technology-${project.slug}-${t}`}>{t}</span>)}</div>
        <div className="card-footer">
          <div>
            <span className="price-label">from</span>
            <strong data-testid={`project-price-${project.slug}`}>{money(project.discount_price || project.price)}</strong>
          </div>
          <button className="small-cta" onClick={() => onAdd(project)} data-testid={`add-to-cart-${project.slug}`}>Add to cart <ArrowRight size={15} /></button>
        </div>
      </div>
    </article>
  );
}

// ---------- Pages ----------
function Home({ onAdd }) {
  const { data: projects, loading } = useProjects({ sort: 'featured' });
  return (
    <Shell>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="overline"><span className="pulse"></span> A better way to build your final project</div>
            <h1>Build smarter.<br /><em>Learn faster.</em><br />Present better.</h1>
            <p className="hero-lede">Ready-to-run software projects with the code, context and confidence to take your ideas from laptop to presentation day.</p>
            <div className="hero-actions">
              <Link to="/projects" className="primary-btn" data-testid="hero-explore-projects">Explore projects <ArrowRight size={17} /></Link>
              <a href="#how-it-works" className="text-btn" data-testid="hero-how-it-works">How it works <ChevronRight size={16} /></a>
            </div>
            <div className="hero-proof">
              <span><ShieldCheck size={17} /> Secure checkout</span>
              <span><BookOpen size={17} /> Complete docs</span>
              <span><Play size={17} /> Video lessons</span>
            </div>
          </div>
          <div className="hero-preview" data-testid="hero-project-preview">
            <div className="preview-top">
              <span className="window-dots"><i></i><i></i><i></i></span>
              <span className="mono">project / neural-notes</span>
              <span className="preview-status">READY TO RUN</span>
            </div>
            <div className="preview-main">
              <div className="preview-sidebar"><span className="side-active">01</span><span>02</span><span>03</span><span>04</span></div>
              <div className="preview-code">
                <span className="code-muted">// your next project starts here</span>
                <span><b className="c-orange">const</b> project = <b className="c-blue">await</b> <b className="c-green">studium</b>.get(</span>
                <span className="indent"><b className="c-orange">'neural-notes'</b>);</span><br />
                <span><b className="c-blue">return</b> project.<b className="c-green">readyToRun</b>;</span>
                <div className="code-card">
                  <Sparkles size={16} />
                  <div><b>What you get</b><small>Source · Docs · Video · Report</small></div>
                  <span className="check">✓</span>
                </div>
              </div>
            </div>
            <div className="preview-bottom"><span>01 / 06 — FEATURED PROJECT</span><strong>Learn by building something real.</strong></div>
          </div>
        </section>

        <section className="trust-strip">
          <span className="trust-lead">EVERYTHING YOU NEED TO <b>BUILD & PRESENT</b></span>
          <span><Zap size={16} /> Ready-to-run code</span>
          <span><BookOpen size={16} /> Clear documentation</span>
          <span><Play size={16} /> Short video walkthroughs</span>
          <span><ShieldCheck size={16} /> Secure access</span>
        </section>

        <section className="section" id="categories">
          <div className="section-head">
            <div><span className="section-kicker">01 / FIND YOUR LANE</span><h2>Projects with a point of view.</h2></div>
            <Link to="/projects" className="text-btn" data-testid="categories-view-all">View all projects <ArrowRight size={16} /></Link>
          </div>
          <div className="category-grid">
            {['AI / ML','Generative AI','Computer Vision','Full Stack','Data Science','NLP'].map((c, i) => (
              <Link to={`/projects?category=${encodeURIComponent(c)}`} className="category-item" key={c} data-testid={`category-${i}`}>
                <span className="category-number">0{i + 1}</span><span>{c}</span><ArrowUpRight />
              </Link>
            ))}
          </div>
        </section>

        <section className="section featured-section">
          <div className="section-head">
            <div><span className="section-kicker">02 / CURATED FOR YOU</span><h2>Start with something real.</h2></div>
            <span className="result-note">{loading ? 'Loading…' : `${projects.length} projects in the library`}</span>
          </div>
          <div className="project-grid">{projects.slice(0, 3).map(p => <ProjectCard key={p.slug} project={p} onAdd={onAdd} />)}</div>
        </section>

        <section className="process-section" id="how-it-works">
          <div className="section-head"><div><span className="section-kicker">03 / THE STUDIUM METHOD</span><h2>Less hunting. More building.</h2></div></div>
          <div className="process-grid">
            {[['01','Explore','Find a project that matches your stack, year and ambition.'],['02','Understand','See exactly what is included before you commit.'],['03','Build & present','Run it locally, learn the why, and make it yours.']].map(([n, t, d]) => (
              <div className="process-item" key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p><ArrowRight size={18} /></div>
            ))}
          </div>
        </section>

        <section className="quote-section">
          <div className="quote-mark">"</div>
          <blockquote>Good projects do more than pass a review.<br /><em>They give you something to talk about.</em></blockquote>
          <span className="quote-credit">— The Studium principle</span>
        </section>
      </main>
      <Footer />
    </Shell>
  );
}

function Catalog({ onAdd }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('featured');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(t); }, [search]);
  const filters = useMemo(() => ({ search: debouncedSearch, category, sort }), [debouncedSearch, category, sort]);
  const { data, loading } = useProjects(filters);
  return (
    <Shell>
      <main className="catalog-page">
        <div className="catalog-header">
          <div>
            <span className="section-kicker">PROJECT LIBRARY / 2025</span>
            <h1>Explore projects<span className="brand-dot">.</span></h1>
            <p>Find a project that fits your skills, your semester and what you want to learn next.</p>
          </div>
          <div className="catalog-count" data-testid="catalog-result-count">
            <strong>{loading ? '—' : data.length}</strong><span>projects<br />ready to run</span>
          </div>
        </div>
        <div className="catalog-toolbar">
          <div className="search-box">
            <Search size={18} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title, stack or idea…" aria-label="Search projects" data-testid="project-search-input" />
          </div>
          <div className="filter-buttons">
            <button className={category ? 'filter-btn active' : 'filter-btn'} onClick={() => setCategory(category ? '' : 'AI / ML')} data-testid="category-filter-button">
              <Filter size={15} /> {category || 'Category'} <ChevronDown size={14} />
            </button>
            <select value={sort} onChange={e => setSort(e.target.value)} className="sort-select" aria-label="Sort projects" data-testid="sort-projects-select">
              <option value="featured">Featured first</option>
              <option value="newest">Newest</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
            </select>
          </div>
        </div>
        {category && (
          <div className="active-filter">
            <span>Category: {category}</span>
            <button onClick={() => setCategory('')} aria-label="Clear filter" data-testid="clear-category-filter"><X size={14} /></button>
          </div>
        )}
        <div className="catalog-layout">
          <aside className="filter-rail">
            <span className="filter-title">FILTER BY</span>
            <div className="filter-group">
              <b>Discipline</b>
              {['AI / ML','Generative AI','Computer Vision','Full Stack','Data Science','NLP'].map(c => (
                <button key={c} onClick={() => setCategory(category === c ? '' : c)} className={category === c ? 'selected' : ''} data-testid={`discipline-filter-${c}`}>{c}<span>{category === c ? '✓' : '+'}</span></button>
              ))}
            </div>
            <div className="filter-group">
              <b>Complexity</b>
              {['Beginner','Intermediate','Advanced'].map(c => (
                <button key={c} data-testid={`complexity-filter-${c}`}>{c}<span>+</span></button>
              ))}
            </div>
          </aside>
          <section className="catalog-results">
            {loading ? (
              <div className="loading-state" data-testid="projects-loading"><span></span><span></span><span></span></div>
            ) : data.length === 0 ? (
              <div className="empty-state" data-testid="projects-empty"><CircleHelp size={28} /><h3>No projects found</h3><p>Try a different search or clear your filters.</p></div>
            ) : (
              <div className="project-grid">{data.map(p => <ProjectCard key={p.slug} project={p} onAdd={onAdd} />)}</div>
            )}
          </section>
        </div>
      </main>
    </Shell>
  );
}

function Detail({ onAdd }) {
  const { slug } = useParams();
  const { user } = useAuth();
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [owned, setOwned] = useState(false);

  useEffect(() => { getProject(slug).then(setProject).catch(() => setProject(false)); }, [slug]);
  useEffect(() => {
    if (user && project?.id) hasPurchased(user.id, project.id).then(setOwned);
  }, [user, project]);

  if (project === false) return <Shell><div className="empty-state page-empty"><h2>Project not found</h2><Link to="/projects" className="primary-btn">Back to projects</Link></div></Shell>;
  if (!project) return <Shell><div className="loading-state page-empty"><span></span><span></span></div></Shell>;

  return (
    <Shell>
      <main className="detail-page">
        <div className="breadcrumbs">
          <Link to="/projects" data-testid="detail-back-projects">Projects</Link><ChevronRight size={13} /><span>{project.category}</span>
        </div>
        <section className="detail-hero">
          <div className="detail-visual" style={{ '--accent': project.accent || '#244B74', overflow: 'hidden', position: 'relative' }}>
            {project.youtube_url ? (
              <iframe
                width="100%"
                height="100%"
                src={getYoutubeEmbedUrl(project.youtube_url)}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{ border: 'none', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 5 }}
              />
            ) : (
              <>
                <div className="visual-grid"></div>
                <span className="detail-code">{(project.technologies || []).join('  /  ')}</span>
                <div className="detail-play"><Play size={23} fill="currentColor" /></div>
                <span className="preview-label">30-SECOND PREVIEW</span>
              </>
            )}
          </div>
          <div className="detail-copy">
            <span className="section-kicker">{project.category} / {project.complexity}</span>
            <h1>{project.title}<span className="brand-dot">.</span></h1>
            <p>{project.description}</p>
            <div className="detail-meta">
              <span><b>Best for</b>{(project.suitable_years || []).join(' · ')}</span>
              <span><b>Includes</b>{(project.deliverables || []).length} deliverables</span>
            </div>
            <div className="buy-panel">
              <div>
                <span className="price-label">complete project access</span>
                <strong>{money(project.discount_price || project.price)}</strong>
                <del>{project.discount_price ? money(project.price) : ''}</del>
              </div>
              {owned ? (
                <button className="primary-btn" onClick={() => startDownload(project.slug)} data-testid="detail-download">Download source <ArrowRight size={16} /></button>
              ) : (
                <button className="primary-btn" onClick={() => onAdd(project)} data-testid="detail-add-to-cart">Add to cart <ShoppingBag size={16} /></button>
              )}
            </div>
            <div className="secure-note"><ShieldCheck size={17} /> Secure checkout · Instant access after verification</div>
          </div>
        </section>
        <div className="detail-tabs" role="tablist">
          {['Overview','What is included','Setup','Learning path'].map(t => (
            <button className={tab === t ? 'active' : ''} onClick={() => setTab(t)} key={t} role="tab" data-testid={`detail-tab-${t.toLowerCase().replaceAll(' ', '-')}`}>{t}</button>
          ))}
        </div>
        <section className="detail-content">
          <div>
            <span className="section-kicker">{tab.toUpperCase()}</span>
            <h2>{tab === 'Overview' ? 'A project you can explain with confidence.' : tab}</h2>
            <p>{project.description} This package is structured so you can move from setup to a clear demo without guessing what comes next.</p>
            <div className="feature-list">{(project.features || []).map((f, i) => (
              <div key={f} data-testid={`feature-${i}`}><span>0{i + 1}</span><b>{f}</b><ChevronRight size={16} /></div>
            ))}</div>
          </div>
          <aside className="deliverables-panel">
            <span className="section-kicker">IN THE BOX</span>
            <h3>Everything behind the download.</h3>
            {(project.deliverables || []).map(d => (
              <div className="deliverable" key={d}><span>✓</span><span>{d}</span></div>
            ))}
            {owned ? (
              <Link to="/dashboard/purchases" className="outline-btn" data-testid="detail-view-purchase">View purchase <ArrowRight size={15} /></Link>
            ) : (
              <button className="outline-btn" onClick={() => onAdd(project)} data-testid="detail-secondary-add">Get this project <ArrowRight size={15} /></button>
            )}
          </aside>
        </section>
      </main>
    </Shell>
  );
}

function Cart({ items, setItems }) {
  const total = items.reduce((a, p) => a + (p.discount_price || p.price), 0);
  return (
    <Shell cartCount={items.length}>
      <main className="cart-page">
        <div className="section-kicker">YOUR SHORTLIST / {items.length.toString().padStart(2, '0')}</div>
        <h1>Ready when you are<span className="brand-dot">.</span></h1>
        {!items.length ? (
          <div className="empty-state cart-empty">
            <ShoppingBag size={34} />
            <h2>Your cart is empty</h2>
            <p>The right project is waiting in the library.</p>
            <Link to="/projects" className="primary-btn" data-testid="empty-cart-explore">Explore projects <ArrowRight size={16} /></Link>
          </div>
        ) : (
          <div className="cart-layout">
            <section className="cart-items">
              {items.map(p => (
                <div className="cart-item" key={p.slug} data-testid={`cart-item-${p.slug}`}>
                  <div className="mini-visual" style={{ '--accent': p.accent || '#244B74' }}><Zap size={19} /></div>
                  <div className="cart-item-copy"><span>{p.category}</span><h3>{p.title}</h3><small>{(p.technologies || []).join(' · ')}</small></div>
                  <strong>{money(p.discount_price || p.price)}</strong>
                  <button onClick={() => { setItems(items.filter(i => i.slug !== p.slug)); toast('Removed from shortlist'); }} aria-label={`Remove ${p.title}`} data-testid={`remove-from-cart-${p.slug}`}><X size={18} /></button>
                </div>
              ))}
            </section>
            <aside className="summary-panel">
              <span className="section-kicker">ORDER SUMMARY</span>
              <div className="summary-line"><span>Project access ({items.length})</span><b>{money(total)}</b></div>
              <div className="summary-line muted"><span>Taxes</span><span>Calculated at checkout</span></div>
              <div className="summary-total"><span>Total</span><strong>{money(total)}</strong></div>
              <Link to="/checkout" className="primary-btn full-btn" data-testid="proceed-checkout">Proceed to checkout <ArrowRight size={16} /></Link>
              <small className="summary-note"><ShieldCheck size={14} /> Secure payment via Razorpay</small>
            </aside>
          </div>
        )}
      </main>
    </Shell>
  );
}

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

function Checkout({ items }) {
  const [busy, setBusy] = useState(false);
  const { session, user } = useAuth();
  const pay = async () => {
    if (!user) { toast.error('Sign in to begin secure checkout.'); return; }
    setBusy(true);
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        toast.error('Razorpay SDK failed to load. Are you offline?');
        setBusy(false);
        return;
      }
      const token = session?.access_token;
      const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_slugs: items.map(i => i.slug) }),
      });
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}));
        throw new Error(errBody.detail || 'Failed to create order on server');
      }
      const body = await r.json();
      if (body.status === 'pending_gateway_credentials') {
        toast('Razorpay is not configured — no payment was taken. Order total verified: ' + money(body.amount / 100));
        setBusy(false);
        return;
      }
      toast.success('Order created. Opening Razorpay…');
      
      const options = {
        key: process.env.REACT_APP_RAZORPAY_KEY_ID || 'rzp_test_TQ2d5SX8BCSkS2',
        amount: body.amount,
        currency: body.currency || 'INR',
        name: 'Studium Labs',
        description: 'Digital Project Purchase',
        order_id: body.razorpay_order_id,
        handler: async function (response) {
          setBusy(true);
          try {
            const verifyRes = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/payments/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                order_id: body.order_id
              })
            });
            const verifyBody = await verifyRes.json();
            if (verifyRes.ok && verifyBody.status === 'success') {
              toast.success('Payment verified and completed successfully!');
              window.location.href = '/dashboard/purchases';
            } else {
              toast.error(verifyBody.detail || 'Payment verification failed.');
            }
          } catch (e) {
            toast.error('An error occurred during payment verification.');
          } finally {
            setBusy(false);
          }
        },
        prefill: {
          name: user.email?.split('@')[0],
          email: user.email,
        },
        theme: {
          color: '#E4572E',
        },
        modal: {
          ondismiss: function () {
            toast('Payment cancelled by user.');
            setBusy(false);
          }
        }
      };
      
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        toast.error(`Payment failed: ${response.error.description}`);
        setBusy(false);
      });
      rzp.open();
    } catch (e) {
      toast.error(e.message || 'Checkout could not start. Please try again.');
      setBusy(false);
    }
  };
  return (
    <Shell cartCount={items.length}>
      <main className="checkout-page">
        <div>
          <span className="section-kicker">CHECKOUT / SECURE ACCESS</span>
          <h1>One step from<br /><em>building.</em></h1>
          <p className="checkout-intro">Your access is unlocked only after the payment is verified securely by the server.</p>
          <div className="checkout-note">
            <ShieldCheck />
            <div><b>Protected payment flow</b><span>Razorpay order creation and signature verification happen on the FastAPI backend.</span></div>
          </div>
        </div>
        <aside className="payment-panel">
          <span className="section-kicker">YOUR ORDER</span>
          {items.map(p => (<div className="payment-item" key={p.slug}><span>{p.title}</span><b>{money(p.discount_price || p.price)}</b></div>))}
          <div className="payment-total"><span>Total due</span><strong>{money(items.reduce((a, p) => a + (p.discount_price || p.price), 0))}</strong></div>
          <button className="primary-btn full-btn" onClick={pay} disabled={busy || !items.length} data-testid="pay-now-button">{busy ? 'Preparing secure order…' : 'Continue to Razorpay'} <ArrowRight size={16} /></button>
          <p className="terms-copy">By continuing, you agree to our educational use and refund policy.</p>
        </aside>
      </main>
    </Shell>
  );
}

// ---------- Auth screens ----------
function Login() {
  const { signIn, signInWithGoogle, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) toast.error(error);
    else { toast.success('Signed in'); navigate('/dashboard'); }
  };

  return (
    <Shell>
      <main className="auth-page">
        <div className="auth-aside">
          <span className="brand-mark large">S</span>
          <h1>Build something<br /><em>worth explaining.</em></h1>
          <p>Sign in to access your purchases, downloads and learning path.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <span className="section-kicker">WELCOME BACK</span>
          <h2>Log in to Studium</h2>
          <label>Email address<input type="email" required placeholder="you@university.edu" value={email} onChange={e => setEmail(e.target.value)} data-testid="login-email" /></label>
          <label>Password<input type="password" required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} data-testid="login-password" /></label>
          <button className="primary-btn full-btn" type="submit" disabled={busy} data-testid="login-submit">{busy ? 'Signing in…' : 'Continue'} <ArrowRight size={16} /></button>
          <button type="button" className="google-btn" onClick={async () => { const { error } = await signInWithGoogle(); if (error) toast.error(error); }} data-testid="google-login-button">Continue with Google</button>
          <p className="auth-switch">New here? <Link to="/register" data-testid="register-link">Create an account</Link></p>
        </form>
      </main>
    </Shell>
  );
}

function Register() {
  const { signUp, user } = useAuth();
  const [form, setForm] = useState({ full_name: '', email: '', mobile: '', password: '' });
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  if (user) return <Navigate to="/dashboard" replace />;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { error, session } = await signUp(form.email, form.password, { full_name: form.full_name, mobile: form.mobile });
    setBusy(false);
    if (error) toast.error(error);
    else if (session) { toast.success('Account created'); navigate('/dashboard'); }
    else toast.success('Check your email to confirm your account.');
  };
  return (
    <Shell>
      <main className="auth-page">
        <div className="auth-aside">
          <span className="brand-mark large">S</span>
          <h1>Start with a<br /><em>real project.</em></h1>
          <p>Create your student workspace and keep every purchase in one place.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <span className="section-kicker">JOIN STUDIUM</span>
          <h2>Create your account</h2>
          <label>Full name<input required placeholder="Alex Morgan" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} data-testid="register-name" /></label>
          <label>Email address<input type="email" required placeholder="you@university.edu" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} data-testid="register-email" /></label>
          <label>Mobile number<input placeholder="+91 …" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} data-testid="register-mobile" /></label>
          <label>Password<input type="password" required minLength={8} placeholder="At least 8 characters" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} data-testid="register-password" /></label>
          <button className="primary-btn full-btn" type="submit" disabled={busy} data-testid="register-submit">{busy ? 'Creating account…' : 'Create account'} <ArrowRight size={16} /></button>
          <p className="auth-switch">Already have an account? <Link to="/login" data-testid="login-link">Log in</Link></p>
        </form>
      </main>
    </Shell>
  );
}

// ---------- Guards ----------
function RequireAuth({ children, admin = false }) {
  const { loading, user, isAdmin } = useAuth();
  if (loading) return <Shell><div className="loading-state page-empty"><span></span><span></span></div></Shell>;
  if (!user) {
    return (
      <Shell>
        <div className="empty-state page-empty">
          <ShieldCheck size={32} />
          <h2>Sign in to continue</h2>
          <p>Sign in to access your workspace and purchases.</p>
          <Link to="/login" className="primary-btn" data-testid="protected-route-login">Go to login <ArrowRight size={16} /></Link>
        </div>
      </Shell>
    );
  }
  if (admin && !isAdmin) {
    return (
      <Shell>
        <div className="empty-state page-empty">
          <ShieldCheck size={32} />
          <h2>Admin access is protected</h2>
          <p>Only administrator accounts can access the control room.</p>
          <Link to="/" className="primary-btn">Back to home <ArrowRight size={16} /></Link>
        </div>
      </Shell>
    );
  }
  return children;
}

// ---------- Student dashboard ----------
function Dashboard() {
  const { user, profile } = useAuth();
  const { data: purchases, loading } = usePurchases();
  return (
    <Shell>
      <main className="dashboard-page">
        <aside className="dashboard-sidebar">
          <span className="section-kicker">YOUR WORKSPACE</span>
          <h2>Hi, {(profile?.full_name || user?.email || 'there').split(' ')[0]}.</h2>
          {['Overview','My purchases','Downloads','Profile'].map((x, i) => (
            <button className={i === 0 ? 'dash-nav active' : 'dash-nav'} key={x} data-testid={`dashboard-nav-${x.toLowerCase().replace(' ', '-')}`}>{i === 0 ? <LayoutDashboard size={16} /> : <BookOpen size={16} />} {x}<ChevronRight size={14} /></button>
          ))}
          <div className="sidebar-bottom"><ShieldCheck size={16} /><span>Secure account<br /><b>Protected access</b></span></div>
        </aside>
        <section className="dashboard-main">
          <div className="dashboard-top">
            <div><span className="section-kicker">OVERVIEW / TODAY</span><h1>Keep building momentum.</h1></div>
            <Link to="/dashboard/profile" className="outline-btn" data-testid="dashboard-profile-button">Profile <ArrowRight size={15} /></Link>
          </div>
          <div className="stats-grid">
            {[
              [String(purchases.length).padStart(2, '0'), 'Projects owned'],
              [String(purchases.length).padStart(2, '0'), 'Downloads'],
              ['00', 'In progress'],
              ['100%', 'Your access'],
            ].map(([v, l]) => (
              <div className="stat-item" key={l} data-testid={`stat-${l.toLowerCase().replace(' ', '-')}`}><strong>{v}</strong><span>{l}</span></div>
            ))}
          </div>
          <div className="dashboard-list">
            <div className="list-head">
              <div><span className="section-kicker">RECENT PURCHASES</span><h3>Your learning library.</h3></div>
              <Link to="/projects" className="text-btn" data-testid="dashboard-browse-projects">Browse projects <ArrowRight size={15} /></Link>
            </div>
            {loading ? (
              <div className="loading-state" data-testid="dashboard-loading"><span></span></div>
            ) : purchases.length === 0 ? (
              <div className="empty-state" data-testid="dashboard-empty"><ShoppingBag size={26} /><h3>No purchases yet</h3><p>Browse the library to find your next project.</p></div>
            ) : (
              purchases.map((row) => (
                <div className="purchase-row" key={row.id} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px 0', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 12 }}>
                    <div className="mini-visual" style={{ '--accent': row.project?.accent || '#244B74', flexShrink: 0 }}><Zap size={18} /></div>
                    <div style={{ flexGrow: 1 }}>
                      <b>{row.project?.title}</b>
                      <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{row.project?.category || 'Project'} · Purchased</span>
                    </div>
                    <Link to={`/projects/${row.project?.slug}`} className="outline-btn" data-testid={`open-purchase-${row.id}`}>Project details <ArrowRight size={14} /></Link>
                  </div>
                  {row.project?.youtube_url && (
                    <div style={{ marginTop: 8, width: '100%', maxWidth: 480, height: 270, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
                      <iframe
                        width="100%"
                        height="100%"
                        src={getYoutubeEmbedUrl(row.project.youtube_url)}
                        title="Walkthrough"
                        frameBorder="0"
                        allowFullScreen
                      />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
                    <button className="primary-btn" onClick={() => startDownload(row.project?.slug, 'source_zip')} data-testid={`download-purchase-${row.id}`} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>Source Code <ArrowRight size={14} /></button>
                    <button className="outline-btn" onClick={() => startDownload(row.project?.slug, 'explanation_doc')} data-testid={`download-doc-${row.id}`} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>Explanation Doc <ArrowRight size={14} /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </Shell>
  );
}

function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({ full_name: '', mobile: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (profile) setForm({ full_name: profile.full_name || '', mobile: profile.mobile || '' }); }, [profile]);
  const save = async (e) => {
    e.preventDefault();
    if (!supabaseEnabled || !user) return;
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ full_name: form.full_name, mobile: form.mobile, updated_at: new Date().toISOString() }).eq('id', user.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success('Profile updated'); refreshProfile(); }
  };
  return (
    <Shell>
      <main className="dashboard-page">
        <aside className="dashboard-sidebar">
          <span className="section-kicker">YOUR WORKSPACE</span>
          <h2>Account</h2>
        </aside>
        <section className="dashboard-main">
          <div className="dashboard-top"><div><span className="section-kicker">PROFILE</span><h1>Your account details.</h1></div></div>
          <form className="auth-form" onSubmit={save} style={{ maxWidth: 480, marginTop: 32 }}>
            <label>Full name<input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} data-testid="profile-full-name" /></label>
            <label>Email<input value={user?.email || ''} disabled data-testid="profile-email" /></label>
            <label>Mobile<input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} data-testid="profile-mobile" /></label>
            <button className="primary-btn" type="submit" disabled={busy} data-testid="profile-save">{busy ? 'Saving…' : 'Save changes'} <ArrowRight size={16} /></button>
          </form>
        </section>
      </main>
    </Shell>
  );
}

// ---------- Admin ----------
function AdminShell({ tab, children }) {
  const items = [
    ['overview', 'Overview', LayoutDashboard],
    ['projects', 'Projects', BookOpen],
    ['orders', 'Orders', ShoppingBag],
    ['users', 'Users', User],
    ['analytics', 'Analytics', BarChart3],
    ['seo', 'SEO', Sparkles],
  ];
  return (
    <Shell>
      <main className="dashboard-page">
        <aside className="dashboard-sidebar">
          <span className="section-kicker">CONTROL ROOM</span>
          <h2>Admin</h2>
          {items.map(([k, label, Icon]) => (
            <Link key={k} to={`/admin${k === 'overview' ? '' : '/' + k}`} className={`dash-nav ${tab === k ? 'active' : ''}`} data-testid={`admin-nav-${k}`}><Icon size={16} /> {label}<ChevronRight size={14} /></Link>
          ))}
          <div className="sidebar-bottom"><ShieldCheck size={16} /><span>Admin session<br /><b>Protected</b></span></div>
        </aside>
        <section className="dashboard-main">{children}</section>
      </main>
    </Shell>
  );
}

function AdminOverview() {
  const [overview, setOverview] = useState(null);
  useEffect(() => { apiGet('/admin/overview').then(r => setOverview(r.data)).catch(() => setOverview({})); }, []);
  if (!overview) return <AdminShell tab="overview"><div className="loading-state"><span></span></div></AdminShell>;
  return (
    <AdminShell tab="overview">
      <div className="dashboard-top"><div><span className="section-kicker">OVERVIEW / TODAY</span><h1>A clear view of your library.</h1></div></div>
      <div className="stats-grid">
        {[
          [String(overview.total_projects || 0), 'Projects'],
          [String(overview.total_users || 0), 'Students'],
          [String(overview.total_orders || 0), 'Orders'],
          [money((overview.revenue || 0)), 'Revenue'],
        ].map(([v, l]) => (
          <div className="stat-item" key={l} data-testid={`admin-stat-${l.toLowerCase()}`}><strong>{v}</strong><span>{l}</span></div>
        ))}
      </div>
      <div className="admin-chart">
        <div className="chart-head"><div><span className="section-kicker">REVENUE / LAST 7 DAYS</span><h3>Weekly sales momentum.</h3></div><BarChart3 size={21} /></div>
        <div className="bars">
          {(overview.weekly_sales || [30, 40, 50, 60, 45, 70, 80]).map((h, i) => (
            <div className="bar-wrap" key={i}><div className="bar" style={{ height: `${h}%` }}></div><span>{['M','T','W','T','F','S','S'][i]}</span></div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}

function AdminProjects() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const reload = () => { setLoading(true); listProjects({}).then(r => setRows(r || [])).finally(() => setLoading(false)); };
  useEffect(reload, []);
  const remove = async (row) => {
    if (!row.id) { toast.error('This row is not backed by Supabase yet. Run schema.sql first.'); return; }
    if (!window.confirm(`Delete ${row.title}?`)) return;
    try { await deleteProject(row.id); toast.success('Project removed'); reload(); }
    catch (e) { toast.error(e.message); }
  };
  return (
    <AdminShell tab="projects">
      <div className="dashboard-top">
        <div><span className="section-kicker">LIBRARY</span><h1>Manage projects.</h1></div>
        <Link to="/admin/projects/new" className="primary-btn" data-testid="admin-new-project"><Plus size={16} /> New project</Link>
      </div>
      {loading ? (
        <div className="loading-state"><span></span></div>
      ) : rows.length === 0 ? (
        <div className="empty-state"><h3>No projects yet</h3><p>Create your first project to publish it in the catalogue.</p></div>
      ) : (
        <div className="dashboard-list">
          {rows.map(p => (
            <div className="purchase-row" key={p.slug} data-testid={`admin-project-row-${p.slug}`}>
              <div className="mini-visual" style={{ '--accent': p.accent || '#244B74' }}><Zap size={18} /></div>
              <div><b>{p.title}</b><span>{p.category} · {money(p.discount_price || p.price)} · {p.status || 'published'}</span></div>
              <Link to={`/admin/projects/${p.slug}/edit`} className="outline-btn" data-testid={`admin-edit-${p.slug}`}>Edit <ArrowRight size={14} /></Link>
              <button className="outline-btn" onClick={() => remove(p)} data-testid={`admin-delete-${p.slug}`}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {!supabaseEnabled && <p className="terms-copy" style={{ marginTop: 24 }}>Supabase not configured — running on the demo backend seed.</p>}
    </AdminShell>
  );
}

function AdminProjectForm({ mode }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    slug: '', title: '', short_description: '', description: '',
    category: 'AI / ML', complexity: 'Intermediate',
    suitable_years: '', technologies: '', features: '', deliverables: '', learning_outcomes: '',
    price: 999, discount_price: 799, accent: '#244B74',
    featured: false, popular: false, status: 'published',
    youtube_url: '', explanation_document_path: '', source_zip_path: '',
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(mode === 'edit');

  useEffect(() => {
    if (mode === 'edit' && slug) {
      getProject(slug).then((p) => {
        if (p && p !== false) {
          setForm({
            ...form, ...p,
            suitable_years: (p.suitable_years || []).join(', '),
            technologies: (p.technologies || []).join(', '),
            features: (p.features || []).join('\n'),
            deliverables: (p.deliverables || []).join('\n'),
            learning_outcomes: (p.learning_outcomes || []).join('\n'),
            youtube_url: p.youtube_url || '',
            explanation_document_path: p.explanation_document_path || '',
            source_zip_path: p.source_zip_path || '',
          });
        }
      }).finally(() => setLoading(false));
    }
     
  }, [mode, slug]);

  const set = (k, v) => setForm({ ...form, [k]: v });

  const handleUpload = async (e, fieldName, folder) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!supabaseEnabled) {
      toast.error('Supabase is not configured yet.');
      return;
    }
    setBusy(true);
    try {
      const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const filePath = `${folder}/${fileName}`;
      const { data, error } = await supabase.storage.from('source-zips').upload(filePath, file);
      if (error) throw error;
      set(fieldName, filePath);
      toast.success(`${file.name} uploaded successfully!`);
    } catch (err) {
      toast.error(`Upload failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!supabaseEnabled) { toast.error('Run schema.sql in Supabase first.'); return; }
    setBusy(true);
    const payload = {
      slug: form.slug.trim(), title: form.title, short_description: form.short_description, description: form.description,
      category: form.category, complexity: form.complexity,
      suitable_years: form.suitable_years.split(',').map(s => s.trim()).filter(Boolean),
      technologies: form.technologies.split(',').map(s => s.trim()).filter(Boolean),
      features: form.features.split('\n').map(s => s.trim()).filter(Boolean),
      deliverables: form.deliverables.split('\n').map(s => s.trim()).filter(Boolean),
      learning_outcomes: form.learning_outcomes.split('\n').map(s => s.trim()).filter(Boolean),
      price: Number(form.price), discount_price: form.discount_price ? Number(form.discount_price) : null,
      accent: form.accent, featured: !!form.featured, popular: !!form.popular, status: form.status,
      youtube_url: form.youtube_url ? form.youtube_url.trim() : null,
      explanation_document_path: form.explanation_document_path ? form.explanation_document_path.trim() : null,
      source_zip_path: form.source_zip_path ? form.source_zip_path.trim() : null,
      updated_at: new Date().toISOString(),
    };
    try {
      await upsertProject(payload);
      toast.success('Project saved');
      navigate('/admin/projects');
    } catch (e2) { toast.error(e2.message); }
    finally { setBusy(false); }
  };

  if (loading) return <AdminShell tab="projects"><div className="loading-state"><span></span></div></AdminShell>;

  return (
    <AdminShell tab="projects">
      <div className="dashboard-top"><div><span className="section-kicker">{mode === 'edit' ? 'EDIT' : 'CREATE'}</span><h1>{mode === 'edit' ? form.title : 'New project'}</h1></div></div>
      <form className="auth-form" onSubmit={submit} style={{ maxWidth: 720, marginTop: 32 }}>
        <label>Title<input required value={form.title} onChange={e => set('title', e.target.value)} data-testid="admin-project-title" /></label>
        <label>Slug<input required value={form.slug} onChange={e => set('slug', e.target.value)} data-testid="admin-project-slug" /></label>
        <label>Short description<input required value={form.short_description} onChange={e => set('short_description', e.target.value)} data-testid="admin-project-short-description" /></label>
        <label>Long description<textarea rows={4} value={form.description} onChange={e => set('description', e.target.value)} className="w-full border p-3" style={{ background: 'var(--surface)', border: '1px solid var(--line)', padding: 13 }} data-testid="admin-project-description" /></label>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 17, marginBottom: 15 }}>
          <label>Category
            <select value={form.category} onChange={e => set('category', e.target.value)} style={{ background: 'var(--surface)', border: '1px solid var(--line)', padding: 13 }} data-testid="admin-project-category">
              {['AI / ML','Generative AI','Computer Vision','Full Stack','Data Science','NLP'].map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Complexity
            <select value={form.complexity} onChange={e => set('complexity', e.target.value)} style={{ background: 'var(--surface)', border: '1px solid var(--line)', padding: 13 }} data-testid="admin-project-complexity">
              {['Beginner','Intermediate','Advanced'].map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 17, marginBottom: 15 }}>
          <label>Project Zip Path
            <input value={form.source_zip_path} onChange={e => set('source_zip_path', e.target.value)} placeholder="source_zips/file.zip" data-testid="admin-project-zip-path" />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>Or select zip to upload:</span>
            <input type="file" accept=".zip" onChange={e => handleUpload(e, 'source_zip_path', 'source_zips')} style={{ marginTop: 2, fontSize: '0.85rem' }} />
          </label>
          <label>Explanation Doc Path
            <input value={form.explanation_document_path} onChange={e => set('explanation_document_path', e.target.value)} placeholder="explanation_docs/file.pdf" data-testid="admin-project-doc-path" />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>Or select document to upload:</span>
            <input type="file" accept=".pdf,.doc,.docx" onChange={e => handleUpload(e, 'explanation_document_path', 'explanation_docs')} style={{ marginTop: 2, fontSize: '0.85rem' }} />
          </label>
        </div>

        <label>YouTube URL (optional)
          <input value={form.youtube_url} onChange={e => set('youtube_url', e.target.value)} placeholder="https://www.youtube.com/watch?v=..." data-testid="admin-project-youtube" />
        </label>

        {form.youtube_url && getYoutubeEmbedUrl(form.youtube_url) && (
          <div style={{ marginTop: 15, marginBottom: 15 }}>
            <span className="section-kicker">VIDEO PREVIEW</span>
            <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: 8, border: '1px solid var(--line)' }}>
              <iframe
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                src={getYoutubeEmbedUrl(form.youtube_url)}
                title="YouTube video preview"
                allowFullScreen
              />
            </div>
          </div>
        )}

        <label>Suitable years (comma-separated)<input value={form.suitable_years} onChange={e => set('suitable_years', e.target.value)} placeholder="3rd Year, Final Year" data-testid="admin-project-years" /></label>
        <label>Technologies (comma-separated)<input value={form.technologies} onChange={e => set('technologies', e.target.value)} placeholder="Python, FastAPI, LangChain" data-testid="admin-project-tech" /></label>
        <label>Features (one per line)<textarea rows={4} value={form.features} onChange={e => set('features', e.target.value)} style={{ background: 'var(--surface)', border: '1px solid var(--line)', padding: 13 }} data-testid="admin-project-features" /></label>
        <label>Deliverables (one per line)<textarea rows={4} value={form.deliverables} onChange={e => set('deliverables', e.target.value)} style={{ background: 'var(--surface)', border: '1px solid var(--line)', padding: 13 }} data-testid="admin-project-deliverables" /></label>
        <label>Learning outcomes (one per line)<textarea rows={3} value={form.learning_outcomes} onChange={e => set('learning_outcomes', e.target.value)} style={{ background: 'var(--surface)', border: '1px solid var(--line)', padding: 13 }} data-testid="admin-project-learning" /></label>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 17 }}>
          <label>Price (₹)<input type="number" min={0} value={form.price} onChange={e => set('price', e.target.value)} data-testid="admin-project-price" /></label>
          <label>Discount price (₹)<input type="number" min={0} value={form.discount_price || ''} onChange={e => set('discount_price', e.target.value)} data-testid="admin-project-discount" /></label>
          <label>Accent<input value={form.accent} onChange={e => set('accent', e.target.value)} data-testid="admin-project-accent" /></label>
        </div>

        <div style={{ display: 'flex', gap: 22, marginTop: 15, marginBottom: 15 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={form.featured} onChange={e => set('featured', e.target.checked)} data-testid="admin-project-featured" /> Featured</label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={form.popular} onChange={e => set('popular', e.target.checked)} data-testid="admin-project-popular" /> Popular</label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>Status
            <select value={form.status} onChange={e => set('status', e.target.value)} data-testid="admin-project-status" style={{ background: 'var(--surface)', border: '1px solid var(--line)', padding: '4px 10px' }}>
              <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 25 }}>
          <button className="primary-btn" type="submit" disabled={busy} data-testid="admin-project-save">{busy ? 'Saving…' : 'Save project'} <ArrowRight size={16} /></button>
          <Link to="/admin/projects" className="outline-btn" data-testid="admin-project-cancel">Cancel</Link>
        </div>
      </form>
    </AdminShell>
  );
}

function AdminEmpty({ tab, title, body }) {
  return (
    <AdminShell tab={tab}>
      <div className="dashboard-top"><div><span className="section-kicker">{tab.toUpperCase()}</span><h1>{title}</h1></div></div>
      <div className="empty-state" style={{ marginTop: 30 }}><Sparkles size={26} /><h3>Coming next</h3><p>{body}</p></div>
    </AdminShell>
  );
}

function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiGet('/admin/users')
      .then(r => setUsers(r.data || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);
  return (
    <AdminShell tab="users">
      <div className="dashboard-top">
        <div><span className="section-kicker">STUDENTS</span><h1>Active student profiles.</h1></div>
      </div>
      {loading ? (
        <div className="loading-state"><span></span></div>
      ) : users.length === 0 ? (
        <div className="empty-state"><h3>No students registered yet</h3><p>Student accounts sync automatically from Supabase Auth.</p></div>
      ) : (
        <div className="dashboard-list">
          {users.map(u => (
            <div className="purchase-row" key={u.id} data-testid={`admin-user-row-${u.email}`}>
              <div className="mini-visual" style={{ '--accent': '#2F6B4F' }}><User size={18} /></div>
              <div>
                <b>{u.full_name || 'Anonymous User'}</b>
                <span>{u.email} · Registered {new Date(u.created_at).toLocaleDateString()} · {u.role}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}

function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiGet('/admin/orders')
      .then(r => setOrders(r.data || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);
  return (
    <AdminShell tab="orders">
      <div className="dashboard-top">
        <div><span className="section-kicker">SALES / ORDERS</span><h1>Purchase history.</h1></div>
      </div>
      {loading ? (
        <div className="loading-state"><span></span></div>
      ) : orders.length === 0 ? (
        <div className="empty-state"><h3>No orders yet</h3><p>Order transactions will list here in real time.</p></div>
      ) : (
        <div className="dashboard-list">
          {orders.map(o => (
            <div className="purchase-row" key={o.id} data-testid={`admin-order-row-${o.id}`} style={{ display: 'flex', alignItems: 'center' }}>
              <div className="mini-visual" style={{ '--accent': o.status === 'paid' ? '#2F6B4F' : '#E4572E' }}>
                <ShoppingBag size={18} />
              </div>
              <div style={{ flexGrow: 1 }}>
                <b>Order #{o.id.slice(0, 8)}...</b>
                <span>
                  Buyer: {o.buyer?.full_name || 'Unknown'} ({o.buyer?.email || 'N/A'}) · {money(o.amount_paise / 100)} · {o.status.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {new Date(o.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}

function Footer() {
  return (
    <footer id="about">
      <div className="footer-main">
        <div>
          <Link to="/" className="brand inverse"><span className="brand-mark">S</span><span>studium<span className="brand-dot">.</span></span></Link>
          <p>Real projects for the<br />people building tomorrow.</p>
        </div>
        <div className="footer-links">
          <div><b>Explore</b><Link to="/projects">All projects</Link><a href="#categories">Categories</a><a href="#how-it-works">How it works</a></div>
          <div><b>Company</b><a href="#about">About us</a><a href="mailto:hello@studium.example">Contact</a><Link to="/login">Student login</Link></div>
          <div><b>Legal</b><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/refund-policy">Refund policy</Link></div>
        </div>
      </div>
      <div className="footer-bottom"><span>© 2025 Studium Labs</span><span>Built for learning. Made to present.</span></div>
    </footer>
  );
}

// ---------- Simple legal pages ----------
function LegalPage({ title, body }) {
  return (
    <Shell>
      <main className="catalog-page" style={{ maxWidth: 760 }}>
        <span className="section-kicker">LEGAL</span>
        <h1 style={{ fontSize: 52 }}>{title}<span className="brand-dot">.</span></h1>
        <p style={{ color: 'var(--muted)', lineHeight: 1.65, fontSize: 15 }}>{body}</p>
      </main>
    </Shell>
  );
}

// ---------- Root ----------
function AppInner() {
  const [items, setItems] = useState([]);
  const add = (p) => {
    if (!items.find(i => i.slug === p.slug)) {
      setItems([...items, p]);
      toast.success(`${p.title} added to your shortlist`);
    } else toast('Already in your shortlist');
  };
  return (
    <Routes>
      <Route path="/" element={<Home onAdd={add} />} />
      <Route path="/projects" element={<Catalog onAdd={add} />} />
      <Route path="/projects/:slug" element={<Detail onAdd={add} />} />
      <Route path="/cart" element={<Cart items={items} setItems={setItems} />} />
      <Route path="/checkout" element={<RequireAuth><Checkout items={items} /></RequireAuth>} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/dashboard/purchases" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/dashboard/profile" element={<RequireAuth><Profile /></RequireAuth>} />

      <Route path="/admin" element={<RequireAuth admin><AdminOverview /></RequireAuth>} />
      <Route path="/admin/projects" element={<RequireAuth admin><AdminProjects /></RequireAuth>} />
      <Route path="/admin/projects/new" element={<RequireAuth admin><AdminProjectForm mode="new" /></RequireAuth>} />
      <Route path="/admin/projects/:slug/edit" element={<RequireAuth admin><AdminProjectForm mode="edit" /></RequireAuth>} />
      <Route path="/admin/orders" element={<RequireAuth admin><AdminOrders /></RequireAuth>} />
      <Route path="/admin/users" element={<RequireAuth admin><AdminUsers /></RequireAuth>} />
      <Route path="/admin/analytics" element={<RequireAuth admin><AdminEmpty tab="analytics" title="Analytics" body="Detailed traffic, sales and product analytics land here next — powered by the analytics_events table." /></RequireAuth>} />
      <Route path="/admin/seo" element={<RequireAuth admin><AdminEmpty tab="seo" title="SEO" body="Global and per-project SEO overrides will be editable here. Sitemap and structured data ship next." /></RequireAuth>} />

      <Route path="/privacy" element={<LegalPage title="Privacy" body="Studium Labs collects only the minimum data required to run your account and deliver purchased projects. No personal data is sold. Contact hello@studium.example for any privacy question." />} />
      <Route path="/terms" element={<LegalPage title="Terms" body="All projects are provided for educational and learning purposes. You are responsible for complying with your institution's academic honesty policies when using any purchased material." />} />
      <Route path="/refund-policy" element={<LegalPage title="Refund policy" body="Because Studium Labs delivers digital assets immediately after payment, refunds are considered case-by-case within 48 hours of purchase for demonstrably broken deliverables." />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppInner />
      </BrowserRouter>
    </AuthProvider>
  );
}
