export const SIGNUP_MODE = import.meta.env.PUBLIC_SIGNUP_MODE || 'preregister';
export const APP_URL = import.meta.env.PUBLIC_APP_URL || 'https://app.fusionpulse.colefusion.com';

export function isSignupLive() {
  return SIGNUP_MODE === 'live';
}

export function getSignupLabel() {
  return isSignupLive() ? 'Get Started' : 'Get Early Access';
}

export function getSignupHref() {
  return isSignupLive() ? `${APP_URL}/signup` : '/contact';
}

export function getPlanButtonLabel(planName: string) {
  return isSignupLive() ? `Choose ${planName}` : `${planName} — Soon`;
}

export function getPlanButtonClass(highlighted: boolean) {
  if (isSignupLive()) {
    return highlighted
      ? 'bg-gradient-fusion text-zinc-950'
      : 'border border-zinc-700 text-zinc-100 hover:border-zinc-500';
  }
  return 'border border-zinc-700 text-zinc-500 cursor-not-allowed';
}
