const SITE_MONITOR_URL = process.env.SITE_MONITOR_URL || 'http://192.168.50.206:3456';
const AI_REPAIR_AGENT_URL = process.env.AI_REPAIR_AGENT_URL || 'http://192.168.50.206:3457';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (INTERNAL_API_KEY) {
    headers['x-internal-key'] = INTERNAL_API_KEY;
  }
  return headers;
}

export async function createSiteInMonitor(
  tenantId: string,
  data: { name: string; url: string; interval: number; stealth: boolean; video: boolean },
): Promise<string | null> {
  try {
    const response = await fetch(`${SITE_MONITOR_URL}/api/sites`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ...data, tenantId }),
    });

    if (!response.ok) {
      console.error(`Failed to create site in monitor: ${response.status} ${await response.text()}`);
      return null;
    }

    const result: any = await response.json();
    return result.id || result.data?.id || null;
  } catch (err) {
    console.error('Error creating site in monitor:', err);
    return null;
  }
}

export async function crawlSite(siteId: string, instructions?: string): Promise<void> {
  try {
    const response = await fetch(`${SITE_MONITOR_URL}/api/sites/${siteId}/discover`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ instructions: instructions || '' }),
    });

    if (!response.ok) {
      console.error(`Failed to crawl site: ${response.status} ${await response.text()}`);
    }
  } catch (err) {
    console.error('Error crawling site:', err);
  }
}

export async function createDefaultTestSuite(siteId: string): Promise<string | null> {
  try {
    const response = await fetch(`${SITE_MONITOR_URL}/api/tests/suites`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        name: 'Default Test Suite',
        description: 'Auto-generated test suite from provisioning',
        siteId,
      }),
    });

    if (!response.ok) {
      console.error(`Failed to create default test suite: ${response.status} ${await response.text()}`);
      return null;
    }

    const result: any = await response.json();
    return result.id || result.data?.id || null;
  } catch (err) {
    console.error('Error creating default test suite:', err);
    return null;
  }
}

export async function createRepoConfig(
  tenantId: string,
  data: {
    siteUrl: string;
    siteName: string;
    repo: string;
    owner: string;
    token: string;
    instructions?: string;
  },
): Promise<void> {
  try {
    const response = await fetch(`${AI_REPAIR_AGENT_URL}/api/v1/configs`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        tenantId,
        siteUrl: data.siteUrl,
        siteName: data.siteName,
        repo: data.repo,
        owner: data.owner,
        token: data.token,
        instructions: data.instructions || '',
      }),
    });

    if (!response.ok) {
      console.error(`Failed to create repo config: ${response.status} ${await response.text()}`);
    }
  } catch (err) {
    console.error('Error creating repo config:', err);
  }
}

export async function getAuthToken(): Promise<string | null> {
  if (!INTERNAL_API_KEY) return null;

  try {
    const response = await fetch(`${AI_REPAIR_AGENT_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ apiKey: INTERNAL_API_KEY }),
    });

    if (!response.ok) {
      console.error(`Failed to get auth token: ${response.status} ${await response.text()}`);
      return null;
    }

    const result: any = await response.json();
    return result.token || result.data?.token || null;
  } catch (err) {
    console.error('Error getting auth token:', err);
    return null;
  }
}
