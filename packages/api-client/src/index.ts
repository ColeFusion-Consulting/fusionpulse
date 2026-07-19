type ApiClientConfig = { baseUrl: string; getToken: () => string };

async function request<T>(config: ApiClientConfig, path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: {
      ...options?.headers,
      'Content-Type': 'application/json',
      ...(config.getToken() ? { Authorization: `Bearer ${config.getToken()}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function createApiClient(config: ApiClientConfig) {
  return {
    get: <T>(path: string) => request<T>(config, path),
    post: <T>(path: string, body: unknown) => request<T>(config, path, { method: 'POST', body: JSON.stringify(body) }),
    put: <T>(path: string, body: unknown) => request<T>(config, path, { method: 'PUT', body: JSON.stringify(body) }),
    del: <T>(path: string) => request<T>(config, path, { method: 'DELETE' }),
  };
}
