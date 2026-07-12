# FusionPulse by ColeFusion

AI-powered E2E testing platform. Describe what to test in plain English, get Playwright tests back.

> Built with love by **ColeFusion** — from ColdFusion to the future.

## What is FusionPulse?

FusionPulse is a SaaS platform that uses AI to generate, maintain, and run E2E browser tests. Instead of writing brittle selectors by hand, describe your test scenarios in natural language and let AI do the heavy lifting.

**Key features:**
- **AI Test Generation** — plain English → Playwright test steps
- **Smart Monitoring** — HTTP status checks with configurable intervals (5s–5min)
- **Auto-Heal Selectors** — AI detects broken selectors and suggests fixes
- **Multi-Channel Alerting** — PagerDuty, Slack, Discord, email, SMS, phone calls, webhooks
- **Public Status Pages** — shareable status pages with "Powered by FusionPulse" badges
- **Usage-Based Billing** — Stripe integration with Free, Starter, Pro, and Business tiers
- **OSS CLI** — `@fusionpulse/cli` for local test generation (free forever)

## Architecture

```
fusionpulse/
├── packages/
│   ├── api/              Express 5 API (auth, CRUD, billing, notifications)
│   ├── test-runner/      Playwright test executor + SQS consumer
│   ├── web/              React 19 dashboard (Vite + Tailwind)
│   └── cli/              OSS CLI (@fusionpulse/cli)
├── infra/                AWS CDK (VPC, ECS, Aurora, S3, CloudFront, Cognito)
└── .github/
    ├── actions/          Marketplace GitHub Action
    └── workflows/        CI/CD (dev → staging → production)
```

**Tech stack:** TypeScript, Express 5, React 19, Drizzle ORM, PostgreSQL (Aurora), Redis, Playwright, OpenAI/llama.cpp, Stripe, AWS CDK, Turborepo

## Quick Start

### Local Development

```bash
# Start infrastructure
docker compose up -d

# Install dependencies
npm install

# Start dev servers
npm run dev
```

### OSS CLI (Free)

```bash
npm install -g @fusionpulse/cli

# Initialize
fusionpulse init

# Generate a test from English
fusionpulse generate -p "Test the login flow: enter email and password, click submit, verify dashboard"

# Run tests
fusionpulse run
```

### As a GitHub Action

```yaml
- uses: colefusion/fusionpulse/.github/actions/fusionpulse-test@main
  with:
    api-key: ${{ secrets.FUSIONPULSE_API_KEY }}
```

## Pricing

| Plan | Price | Interval | Monitors | AI Generations |
|------|-------|----------|----------|----------------|
| Free | $0/mo | 1 min | 10 | 50 |
| Starter | $5/mo | 15 sec | 50 | 500 |
| Pro | $15/mo | 5 sec | 200 | 2,000 |
| Business | $49/mo | 5 sec | 1,000 | 10,000 |

## Environments

| Environment | Host | Purpose |
|------------|------|---------|
| Dev | Proxmox VM | Active development |
| Staging | Proxmox VM | Pre-production testing |
| Production | AWS (ECS + Aurora) | Live service |

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/amazing`)
3. Commit (`git commit -m 'feat: add amazing feature'`)
4. Push (`git push origin feat/amazing`)
5. Open a PR

## License

MIT © [ColeFusion](https://colefusion.net)
