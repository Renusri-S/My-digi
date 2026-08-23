import { supabase, supabaseEnabled } from '@/lib/supabase';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';

const backendList = async () => {
  const { data } = await apiGet('/blogs');
  return data;
};

const backendOne = async (slug) => {
  const { data } = await apiGet(`/blogs/${slug}`);
  return data;
};

export async function listBlogs() {
  if (supabaseEnabled) {
    const { data, error } = await supabase.from('blogs').select('*').order('created_at', { ascending: false });
    if (!error && data) return data;
  }
  return backendList();
}

export async function getBlog(slug) {
  if (supabaseEnabled) {
    const { data, error } = await supabase.from('blogs').select('*').eq('slug', slug).maybeSingle();
    if (!error && data) return data;
    
    const { data: dataById, error: errorById } = await supabase.from('blogs').select('*').eq('id', slug).maybeSingle();
    if (!errorById && dataById) return dataById;
  }
  return backendOne(slug);
}

export async function upsertBlog(payload) {
  if (supabaseEnabled) {
    const { data, error } = await supabase.from('blogs').upsert(payload).select().single();
    if (!error && data) return data;
    if (error) {
      console.warn("Supabase upsertBlog failed, trying backend:", error.message);
    }
  }
  
  if (payload.id) {
    const { data } = await apiPut(`/admin/blogs/${payload.id}`, payload);
    return data;
  } else {
    const { data } = await apiPost('/admin/blogs', payload);
    return data;
  }
}

export async function deleteBlog(id) {
  if (supabaseEnabled) {
    const { error } = await supabase.from('blogs').delete().eq('id', id);
    if (!error) return true;
    if (error) {
      console.warn("Supabase deleteBlog failed, trying backend:", error.message);
    }
  }
  
  const { data } = await apiDelete(`/admin/blogs/${id}`);
  return data;
}
