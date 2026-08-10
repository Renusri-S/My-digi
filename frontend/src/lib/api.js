import axios from 'axios';
import { supabase, supabaseEnabled } from '@/lib/supabase';

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

async function authHeaders() {
  if (!supabaseEnabled) return {};
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const apiGet = async (path, config = {}) => {
  const headers = { ...(config.headers || {}), ...(await authHeaders()) };
  return axios.get(`${API}${path}`, { ...config, headers });
};

export const apiPost = async (path, body, config = {}) => {
  const headers = { ...(config.headers || {}), ...(await authHeaders()) };
  return axios.post(`${API}${path}`, body, { ...config, headers });
};
