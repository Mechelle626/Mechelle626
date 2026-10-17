"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { CaptchaProvider } from "../lib/auth/human-contracts";

type WidgetApi = {
  render: (
    container: HTMLElement,
    options: Record<string, unknown>,
  ) => string | number;
  reset: (id: string | number) => void;
  remove?: (id: string | number) => void;
};
type CaptchaWindow = Window & {
  grecaptcha?: WidgetApi;
  hcaptcha?: WidgetApi;
  turnstile?: WidgetApi;
  brainCrazeRecaptchaReady?: () => void;
  brainCrazeHcaptchaReady?: () => void;
  brainCrazeTurnstileReady?: () => void;
};
const definitions = {
  recaptcha: {
    global: "grecaptcha",
    callback: "brainCrazeRecaptchaReady",
    src: "https://www.google.com/recaptcha/api.js?render=explicit&onload=brainCrazeRecaptchaReady",
  },
  hcaptcha: {
    global: "hcaptcha",
    callback: "brainCrazeHcaptchaReady",
    src: "https://js.hcaptcha.com/1/api.js?render=explicit&onload=brainCrazeHcaptchaReady",
  },
  turnstile: {
    global: "turnstile",
    callback: "brainCrazeTurnstileReady",
    src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=brainCrazeTurnstileReady",
  },
} as const;
const loaders: Partial<Record<CaptchaProvider, Promise<WidgetApi>>> = {};
function loadProvider(provider: CaptchaProvider): Promise<WidgetApi> {
  const definition = definitions[provider],
    browser = window as CaptchaWindow;
  const api = browser[definition.global] as WidgetApi | undefined;
  if (api?.render) return Promise.resolve(api);
  if (loaders[provider]) return loaders[provider]!;
  const promise = new Promise<WidgetApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = definition.src;
    script.async = true;
    script.defer = true;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      delete browser[definition.callback];
      script.remove();
      reject(
        new Error(
          bcText("ui.3b889f901fff4745"),
        ),
      );
    };
    const timer = setTimeout(fail, 15000);
    browser[definition.callback] = () => {
      if (settled) return;
      const loaded = browser[definition.global] as WidgetApi | undefined;
      if (!loaded?.render) {
        fail();
        return;
      }
      settled = true;
      clearTimeout(timer);
      delete browser[definition.callback];
      resolve(loaded);
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  loaders[provider] = promise;
  void promise.catch(() => {
    if (loaders[provider] === promise) delete loaders[provider];
  });
  return promise;
}
export default function CaptchaWidget({
  provider,
  siteKey,
  challengeId,
  onToken,
  onError,
  onExpired,
}: {
  provider: CaptchaProvider;
  siteKey: string;
  challengeId: string;
  onToken: (token: string) => void;
  onError: (message: string) => void;
  onExpired: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onToken, onError, onExpired });
  callbacks.current = { onToken, onError, onExpired };
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let disposed = false,
      widget: string | number | null = null,
      api: WidgetApi | null = null;
    setLoading(true);
    loadProvider(provider)
      .then((loaded) => {
        if (disposed || !container.current) return;
        api = loaded;
        const options: Record<string, unknown> = {
          sitekey: siteKey,
          theme: "light",
          callback: (token: string) => {
            if (!disposed) callbacks.current.onToken(token);
          },
          "expired-callback": () => {
            if (!disposed) callbacks.current.onExpired();
          },
          "error-callback": () => {
            if (!disposed)
              callbacks.current.onError(
                bcText("ui.022698876954fbce"),
              );
            return true;
          },
        };
        if (provider === "turnstile")
          Object.assign(options, {
            action: "braincraze_human",
            cData: challengeId,
            "response-field": false,
            retry: "never",
            "refresh-expired": "manual",
          });
        widget = loaded.render(container.current, options);
        setLoading(false);
      })
      .catch((error) => {
        if (!disposed) {
          setLoading(false);
          callbacks.current.onError(
            error instanceof Error
              ? error.message
              : bcText("ui.15ba13e6f5f9aa96"),
          );
        }
      });
    const element = container.current;
    return () => {
      disposed = true;
      if (api && widget !== null) {
        try {
          if (api.remove) api.remove(widget);
          else api.reset(widget);
        } catch {
          /* Provider iframe may already be gone during navigation. */
        }
      }
      element?.replaceChildren();
    };
  }, [provider, siteKey, challengeId]);
  return (
    <Localized>
      {
        <div
          className="captcha-widget"
          aria-label={bcText("ui.c98122cda7f1bdda")}
        >
          {loading && (
            <p className="captcha-loading" role="status">
              <LoaderCircle size={16} className="spin" />{" " + bcText("ui.be6493d19be14309") + " "}</p>
          )}
          <div ref={container} />
        </div>
      }
    </Localized>
  );
}
