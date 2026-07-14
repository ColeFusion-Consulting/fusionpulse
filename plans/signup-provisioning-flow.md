# Signup & Provisioning Flow Architecture

## Overview

The signup flow ties together **FusionPulse API** (dashboard + monitors + tests), **site-monitor** (health checks + E2E runner + video), and **AI Repair Agent** (autonomous fix + PR submission). A single signup form collects all user info, creates accounts in all three systems, configures Stripe billing, and runs the provisioning pipeline — all automatically.

---

## 1. Signup Form Fields

### Required
| Field | Type | Purpose |
|-------|------|---------|
| `name` | string | User's full name |
| `email` | string | Login email (used across all systems) |
| `password` | string | Min 8 chars, bcrypt hashed |
| `company_name` | string | Tenant/workspace name |
| `site_url` | URL | The website being monitored/tested |

### Optional
| Field | Type | Purpose |
|-------|------|---------|
| `phone` | string | SMS alert destination |
| `crawl_instructions` | text | Special instructions for the discovery crawler |
| `repo_provider` | "github" \| "gitlab" \| "bitbucket" | VCS provider for AI Repair Agent |
| `repo_owner` | string | GitHub owner/org |
| `repo_name` | string | Repository name |
| `repo_access_token` | string (encrypted) | Personal access token for repo access |
| `agent_instructions` | text | Special instructions for AI Repair Agent |

### Add-ons (for future Stripe integration)
| Add-on | Price | Description |
|--------|-------|-------------|
| `ai_repair_agent` | $15/mo | Autonomous bug fix + PR submission |
| `e2e_video_recordings` | $10/mo | Headed browser video captures |
| `stealth_browser` | $5/mo | CAPTCHA solving + bot detection evasion |
| `phone_alerts` | $8/mo | Phone call alerting via Twilio |
| `multi_region` | $12/mo | Checks from multiple geographic locations |

---

## 2. Backend Flow (FusionPulse API)

### Route: `POST /api/auth/signup`

```typescript
// Request body
{
  name: string,
  email: string,
  password: string,
  company_name: string,
  site_url: string,
  phone?: string,
  crawl_instructions?: string,
  plan: "starter" | "pro" | "business",
  addons: string[],  // ["ai_repair_agent", "e2e_video", ...]
  repo_provider?: "github" | "gitlab" | "bitbucket",
  repo_owner?: string,
  repo_name?: string,
  repo_access_token?: string,
  agent_instructions?: string,
  payment_method_id?: string  // Stripe PaymentMethod for immediate charge
}
```

### Step-by-step pipeline:

```
Request
  │
  ├─ 1. Validate input (Zod schema)
  │
  ├─ 2. Create tenant + user in FusionPulse DB
  │     ├─ tenants table row
  │     ├─ users table row (root user, role=admin)
  │     └─ Generate JWT for auto-login
  │
  ├─ 3. Stripe: create customer + subscription
  │     ├─ Create Stripe Customer
  │     ├─ Attach PaymentMethod (if provided)
  │     ├─ Create Subscription (plan + add-ons as price line items)
  │     └─ Store stripe_customer_id + stripe_subscription_id on tenant
  │
  ├─ 4. Provision site-monitor (HTTP call to site-monitor API)
  │     ├─ POST /api/sites → create site
  │     │     { name, url, interval_seconds, use_stealth, record_video, captcha_api_key }
  │     ├─ POST /api/sites/:id/discover → crawl pages + forms
  │     └─ If plan includes E2E: create default test suite + sample cases
  │
  ├─ 5. Provision AI Repair Agent (HTTP call to ai-repair-agent API)
  │     └─ Only if addons includes "ai_repair_agent" and repo info provided
  │     ├─ POST /api/v1/configs → create repo config
  │     │     { site_id, site_url, site_name, provider, owner, repo,
  │     │       access_token_enc, auto_repair: true, special_instructions }
  │     └─ POST /api/v1/configs/:siteId/test → test connection
  │
  ├─ 6. Verify infrastructure
  │     ├─ Health check → site-monitor /api/health
  │     ├─ Health check → ai-repair-agent /api/health
  │     └─ Confirm all DB rows exist
  │
  ├─ 7. Generate initial test plan
  │     ├─ Create test plan record (status: draft)
  │     ├─ Run AI crawler → discover pages
  │     ├─ Generate suggested test cases from discovered flows
  │     └─ Save as test plan (status: review)
  │
  ├─ 8. Generate initial monitor
  │     ├─ Create HTTP monitor for site_url (interval from plan)
  │     └─ Run first health check immediately
  │
  └─ 9. Return response
        ├─ tokens: { access, refresh }
        ├─ tenant_id
        ├─ site_id (site-monitor)
        ├─ setup_status: "provisioning" | "complete"
        └─ provisioning_url (for SSE status stream)
```

---

## 3. Real-time Provisioning Status

The existing SSE endpoint `GET /api/provisioning/events/:tenantId` streams progress updates. Enhance it to include provisioning from site-monitor and AI Repair Agent:

```
data: {"step": "creating_account", "progress": 5, "label": "Creating your account..."}
data: {"step": "setting_up_billing", "progress": 15, "label": "Setting up billing..."}
data: {"step": "configuring_monitoring", "progress": 30, "label": "Setting up site monitoring..."}
data: {"step": "crawling_site", "progress": 50, "label": "AI is crawling your site..."}
data: {"step": "generating_test_plan", "progress": 70, "label": "Generating test plan..."}
data: {"step": "configuring_repair_agent", "progress": 85, "label": "Configuring AI repair agent..."}
data: {"step": "finalizing", "progress": 95, "label": "Finalizing..."}
data: {"type": "done"}
```

The frontend shows a progress bar with step labels and auto-redirects to the dashboard on completion.

---

## 4. Provisioning Service Implementation

### File: `packages/api/src/services/provisioning.service.ts`

Extend the existing `runProvisioningPipeline()` with new steps:

```typescript
// Current steps (simplified)
async function runProvisioningPipeline(tenantId: string, signupData: SignupInput) {
  const events: ProvisioningEvent[] = [];

  async function step(label: string, fn: () => Promise<void>) {
    await emit({ status: 'in_progress', step: label, progress: calculateProgress() });
    await fn();
    await emit({ status: 'completed', step: label, progress: calculateProgress() });
  }

  await step('Creating account', () => createAccount(tenantId, signupData));
  await step('Setting up billing', () => setupStripe(tenantId, signupData));
  await step('Configuring monitoring', () => provisionSiteMonitor(tenantId, signupData));
  await step('Crawling site', () => runCrawler(tenantId, signupData));
  await step('Generating test plan', () => generateInitialTestPlan(tenantId, signupData));
  if (signupData.repo_access_token) {
    await step('Configuring AI repair', () => provisionAiRepairAgent(tenantId, signupData));
  }
  await step('Finalizing', () => finalizeProvisioning(tenantId));
}
```

### Cross-service API calls

**To site-monitor** (via axios/node-fetch):
```typescript
async function provisionSiteMonitor(tenantId: string, data: SignupInput) {
  const apiKey = await createInternalApiKey(tenantId);
  const res = await fetch(`${SITE_MONITOR_URL}/api/sites`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: data.company_name,
      url: data.site_url,
      interval_seconds: PLAN_INTERVALS[data.plan],
      use_stealth: data.addons.includes('stealth_browser'),
      record_video: data.addons.includes('e2e_video_recordings'),
    }),
  });
  const site = await res.json();
  // Trigger discovery crawl
  await fetch(`${SITE_MONITOR_URL}/api/sites/${site.data.id}/discover`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ instructions: data.crawl_instructions }),
  });
  return site;
}
```

**To AI Repair Agent** (via axios/node-fetch):
```typescript
async function provisionAiRepairAgent(tenantId: string, data: SignupInput) {
  const apiKey = await createInternalApiKey(tenantId);
  const encryptedToken = await encryptToken(data.repo_access_token);
  await fetch(`${AI_REPAIR_AGENT_URL}/api/v1/configs`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      site_id: tenantId,
      site_url: data.site_url,
      site_name: data.company_name,
      provider: data.repo_provider || 'github',
      owner: data.repo_owner,
      repo: data.repo_name,
      access_token_enc: encryptedToken,
      auto_repair: true,
      agent_provider: 'openai',
      min_confidence: 0.7,
      special_instructions: data.agent_instructions,
    }),
  });
}
```

---

## 5. Frontend Signup Page

### Route: `/signup`

A multi-step form with progress indicator:

| Step | Fields |
|------|--------|
| 1. Account | name, email, password, company_name |
| 2. Site | site_url, crawl_instructions |
| 3. Plan | Plan selection + add-on toggles (from pricing page) |
| 4. Payment | Stripe PaymentElement (credit card) |
| 5. AI Agent (conditional) | repo_provider, repo_owner, repo_name, repo_access_token, agent_instructions |
| 6. Confirmation | Summary + "Start Setup" button |

Existing file: `packages/web/src/pages/Signup.tsx` (currently 3-step provisioning wizard)

**Changes needed:**
- Add plan selection step (reuse plan data from pricing)
- Add Stripe PaymentElement (use `@stripe/react-stripe-js`)
- Add AI Repair Agent configuration step (shown conditionally when add-on selected)
- Add provisioning status screen (SSE connection to `/api/provisioning/events/:tenantId`)
- Auto-redirect to dashboard on completion

---

## 6. Database Schema Additions

### New columns on `tenants` table:
```sql
ALTER TABLE tenants ADD COLUMN stripe_subscription_id VARCHAR(255);
ALTER TABLE tenants ADD COLUMN addons JSONB DEFAULT '[]';
ALTER TABLE tenants ADD COLUMN provisioning_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE tenants ADD COLUMN crawl_instructions TEXT;
ALTER TABLE tenants ADD COLUMN agent_instructions TEXT;
```

### New table: `provisioning_log`
```sql
CREATE TABLE provisioning_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  step VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL,
  message TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

---

## 7. Stripe Integration

### Products & Prices (created in Stripe Dashboard)

| Product | Stripe Price ID (lookup key) | Amount |
|---------|------------------------------|--------|
| FusionPulse - Starter | `fusionpulse-starter` | $5/mo |
| FusionPulse - Pro | `fusionpulse-pro` | $15/mo |
| FusionPulse - Business | `fusionpulse-business` | $49/mo |
| Add-on: AI Repair Agent | `fusionpulse-addon-repair-agent` | $15/mo |
| Add-on: E2E Video | `fusionpulse-addon-video` | $10/mo |
| Add-on: Stealth Browser | `fusionpulse-addon-stealth` | $5/mo |
| Add-on: Phone Alerts | `fusionpulse-addon-phone-alerts` | $8/mo |
| Add-on: Multi-Region | `fusionpulse-addon-multi-region` | $12/mo |

### Checkout flow:
1. Stripe PaymentElement on frontend → confirms PaymentMethod
2. Backend calls Stripe API to create subscription with all selected price IDs
3. Webhook `checkout.session.completed` triggers provisioning pipeline
4. Subscription status tracked on `tenants.stripe_subscription_id`

---

## 8. Files to Create/Modify

### New files:
| File | Purpose |
|------|---------|
| `packages/api/src/services/stripe.service.ts` | Stripe customer/subscription management (merge existing billing.service.ts stripe logic) |
| `packages/api/src/services/provisioning-client.service.ts` | HTTP client calls to site-monitor and ai-repair-agent |
| `packages/web/src/pages/Signup.tsx` | Rewrite multi-step signup with plan selection + payment + AI config |
| `packages/api/src/middleware/internal-api-key.ts` | Generate/manage internal API keys for cross-service auth |

### Modify:
| File | Changes |
|------|---------|
| `packages/api/src/routes/auth.ts` | Enhance `POST /signup` to accept full payload, trigger pipeline |
| `packages/api/src/services/provisioning.service.ts` | Add site-monitor + AI repair agent provisioning steps |
| `packages/api/src/services/billing.service.ts` | Add subscription creation with add-ons |
| `packages/api/src/db/schema.ts` | Add provisioning columns + provisioning_log table |
| `packages/api/src/drizzle/*.sql` | Migration for new columns and table |
| `packages/web/src/contexts/AuthContext.tsx` | Handle new signup flow response |

---

## 9. Implementation Order

1. **Phase 1** — Extend FusionPulse API provisioning pipeline with new steps
2. **Phase 2** — Add Stripe subscription management (plan + add-ons)
3. **Phase 3** — Cross-service API clients (site-monitor + ai-repair-agent)
4. **Phase 4** — Rewrite frontend signup page (multi-step with plan selection + Stripe PaymentElement)
5. **Phase 5** — Conditional AI Repair Agent provisioning
6. **Phase 6** — End-to-end testing of the full flow
7. **Phase 7** — Re-enable signup buttons on marketing site
