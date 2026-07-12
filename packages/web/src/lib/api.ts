import { useAuth } from '../contexts/AuthContext';

const BASE = '/api';

export function useApi() {
  const { token } = useAuth();

  const headers = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  async function get<T = any>(path: string): Promise<T> {
    const res = await fetch(`${BASE}${path}`, { headers: headers() });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed');
    return json.data;
  }

  async function post<T = any>(path: string, body?: any): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed');
    return json.data;
  }

  async function put<T = any>(path: string, body?: any): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: 'PUT',
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed');
    return json.data;
  }

  async function del<T = any>(path: string): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: 'DELETE',
      headers: headers(),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed');
    return json.data;
  }

  return { get, post, put, del };
}
