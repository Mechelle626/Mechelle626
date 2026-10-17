export const captchaProviders = ["recaptcha", "hcaptcha", "turnstile"] as const;
export type CaptchaProvider = (typeof captchaProviders)[number];
export const captchaNames = {
  recaptcha: "Google reCAPTCHA",
  hcaptcha: "hCaptcha",
  turnstile: "Cloudflare Turnstile",
} as const;
export type HumanStatus = {
  humanVerified: boolean;
  provider: CaptchaProvider;
  siteKey: string | null;
  configured: boolean;
  next: string;
};
