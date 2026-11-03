import { useEffect, useRef, useState } from 'react';
import { ErrorMessage } from '@/components/states';

const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      language: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoad: Promise<TurnstileApi> | null = null;

function loadTurnstile() {
  if (!scriptLoad) {
    scriptLoad = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error()));
      script.onerror = () => {
        scriptLoad = null;
        script.remove();
        reject(new Error());
      };
      document.head.append(script);
    });
  }
  return scriptLoad;
}

interface TurnstileWidgetProps {
  onTokenChange: (token: string) => void;
}

export function TurnstileWidget({ onTokenChange }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!siteKey) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    let remove = () => {};
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) {
          return;
        }
        const widgetId = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          language: 'es',
          callback: onTokenChange,
          'expired-callback': () => onTokenChange(''),
          'error-callback': () => {
            onTokenChange('');
            setFailed(true);
          },
        });
        remove = () => turnstile.remove(widgetId);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      remove();
    };
  }, [onTokenChange]);

  if (failed) {
    return (
      <ErrorMessage>
        No se pudo cargar la verificación CAPTCHA. Recarga la página e inténtalo de nuevo.
      </ErrorMessage>
    );
  }
  return <div ref={containerRef} className="min-h-[65px]" />;
}
