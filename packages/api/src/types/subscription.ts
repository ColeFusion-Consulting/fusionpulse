export type SignupMode = 'preregister' | 'live';
export type PlanId = 'free' | 'starter' | 'pro' | 'business';
export type AddonId = 'ai_repair_agent' | 'e2e_video_recordings' | 'stealth_browser' | 'phone_alerts' | 'multi_region';

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  companyName: string;
  siteUrl: string;
  phone?: string;
  crawlInstructions?: string;
  plan: PlanId;
  addons: AddonId[];
  repoProvider?: string;
  repoOwner?: string;
  repoName?: string;
  repoAccessToken?: string;
  agentInstructions?: string;
  paymentMethodId?: string;
}

export interface AddonDefinition {
  id: AddonId;
  name: string;
  description: string;
  monthlyPrice: number;
  stripePriceId: string;
}
