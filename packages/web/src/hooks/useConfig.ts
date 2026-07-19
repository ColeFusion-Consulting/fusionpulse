import { useState, useEffect } from 'react';

interface Plan {
  id: string;
  name: string;
  price: number;
  description: string;
}

interface Addon {
  id: string;
  name: string;
  price: number;
  description: string;
}

interface Config {
  signupMode: string;
  preregisterUrl: string;
  plans: Plan[];
  addons: Addon[];
  stripePublishableKey: string;
}

let cachedConfig: Config | null = null;
let cachedPromise: Promise<Config> | null = null;

async function fetchConfig(): Promise<Config> {
  if (cachedConfig) return cachedConfig;
  if (cachedPromise) return cachedPromise;

  cachedPromise = (async () => {
    try {
      const res = await fetch('/api/config');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch config');
      cachedConfig = json.data as Config;
      return cachedConfig;
    } finally {
      cachedPromise = null;
    }
  })();

  return cachedPromise;
}

export function useConfig() {
  const [config, setConfig] = useState<Config | null>(cachedConfig);
  const [loading, setLoading] = useState(!cachedConfig);
  const [error, setError] = useState('');

  useEffect(() => {
    if (cachedConfig) {
      setConfig(cachedConfig);
      setLoading(false);
      return;
    }

    let cancelled = false;

    fetchConfig()
      .then((data) => {
        if (!cancelled) {
          setConfig(data);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    signupMode: config?.signupMode ?? 'standard',
    preregisterUrl: config?.preregisterUrl ?? '',
    plans: config?.plans ?? [],
    addons: config?.addons ?? [],
    stripePublishableKey: config?.stripePublishableKey ?? '',
    loading,
    error,
  };
}
