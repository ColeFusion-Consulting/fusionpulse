import { PLANS } from './billing.service.js';
import { ADDONS } from './stripe-subscription.service.js';
import type { AddonId } from '../types/subscription.js';

export function getPublicConfig() {
  return {
    signupMode: (process.env.SIGNUP_MODE || 'preregister') as 'preregister' | 'live',
    preregisterUrl: process.env.PREREGISTER_URL || '/contact',
    plans: PLANS,
    addons: Object.values(ADDONS).reduce((acc, addon) => {
      acc[addon.id] = {
        id: addon.id,
        name: addon.name,
        description: addon.description,
        monthlyPrice: addon.monthlyPrice,
      };
      return acc;
    }, {} as Record<AddonId, { id: AddonId; name: string; description: string; monthlyPrice: number }>),
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  };
}
