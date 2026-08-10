import { supabase, supabaseEnabled } from '@/lib/supabase';
import { apiGet } from '@/lib/api';

// Projects repository — prefers Supabase, falls back to FastAPI (Mongo demo seed).
// Falls back automatically if the schema has not been applied yet (missing table error).

const backendList = async (params) => {
  const q = new URLSearchParams(params).toString();
  const { data } = await apiGet(`/projects${q ? `?${q}` : ''}`);
  return data;
};

const backendOne = async (slug) => (await apiGet(`/projects/${slug}`)).data;

export async function listProjects({ search = '', category = '', complexity = '', sort = 'featured' } = {}) {
  if (supabaseEnabled) {
    let q = supabase.from('projects').select('*').eq('status', 'published');
    if (category) q = q.eq('category', category);
    if (complexity) q = q.eq('complexity', complexity);
    if (search) q = q.or(`title.ilike.%${search}%,short_description.ilike.%${search}%,category.ilike.%${search}%`);
    if (sort === 'price-low') q = q.order('discount_price', { ascending: true, nullsFirst: false });
    else if (sort === 'price-high') q = q.order('discount_price', { ascending: false, nullsFirst: false });
    else if (sort === 'newest') q = q.order('created_at', { ascending: false });
    else q = q.order('featured', { ascending: false }).order('popular', { ascending: false });
    const { data, error } = await q.limit(100);
    if (!error && data) return data;
  }
  return backendList({ search, category, complexity, sort });
}

export async function getProject(slug) {
  if (supabaseEnabled) {
    const { data, error } = await supabase.from('projects').select('*').eq('slug', slug).maybeSingle();
    if (!error && data) return data;
  }
  return backendOne(slug);
}

export async function getCategories() {
  if (supabaseEnabled) {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (!error && data && data.length) return data;
  }
  return (await apiGet('/categories')).data;
}

export async function listUserPurchases(userId) {
  if (!supabaseEnabled || !userId) return [];
  const { data } = await supabase
    .from('purchases')
    .select('id, created_at, project:projects(id,slug,title,category,accent,thumbnail_path)')
    .eq('buyer_id', userId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function hasPurchased(userId, projectId) {
  if (!supabaseEnabled || !userId || !projectId) return false;
  const { data } = await supabase
    .from('purchases').select('id').eq('buyer_id', userId).eq('project_id', projectId).maybeSingle();
  return Boolean(data);
}

export async function upsertProject(payload) {
  if (!supabaseEnabled) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('projects').upsert(payload, { onConflict: 'slug' }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProject(id) {
  if (!supabaseEnabled) throw new Error('Supabase not configured');
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}
