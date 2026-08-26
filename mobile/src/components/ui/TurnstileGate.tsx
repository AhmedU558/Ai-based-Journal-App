import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { USE_MOCKS, WEB_BASE_URL } from '@/config/env';

// Cloudflare has no official React Native SDK - the standard workaround is
// embedding the real web widget inside a WebView and bridging the token
// back to RN via postMessage. Loading the widget from a REAL URL under the
// app's own production origin (not react-native-webview's `source={{html}}`,
// which has no real origin at all) is required - Turnstile validates the
// requesting page's origin against the hostnames configured for the site
// key in the Cloudflare dashboard, and an opaque inline-HTML WebView can
// never pass that check ("Unable to connect to website", confirmed live on
// a real device). frontend/public/turnstile-embed.html is the real page
// this loads, served from the same origin the web app's own working widget
// already uses.
const SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAEWhANuGDYcQFFUh';

interface TurnstileGateProps {
  action: 'login' | 'register';
  onVerify: (token: string) => void;
  // Changing this remounts the WebView for a fresh, unused token - Turnstile
  // tokens are single-use, so a failed submit needs a new one before retry.
  resetKey: number;
}

export function TurnstileGate({ action, onVerify, resetKey }: TurnstileGateProps) {
  const [error, setError] = useState('');

  // Pass A (EXPO_PUBLIC_USE_MOCKS=true) is documented as running entirely
  // against the local mock service layer with no backend required - but the
  // login and register screens both refuse to submit without a Turnstile
  // token, so a real Cloudflare challenge (and therefore real network, and a
  // reachable frontend origin) was still mandatory to get past the first
  // screen. mockAuthService already ignores the token it is handed, so the
  // check was gating the mock flow on infrastructure the mock flow exists to
  // avoid. Hand the screens a placeholder immediately instead, and render
  // nothing.
  useEffect(() => {
    if (!USE_MOCKS) return;
    onVerify('mock-turnstile-token');
  }, [resetKey, onVerify]);

  if (USE_MOCKS) return null;
  if (!SITE_KEY) return null;

  const embedUrl = `${WEB_BASE_URL}/turnstile-embed.html?action=${action}&sitekey=${encodeURIComponent(SITE_KEY)}`;

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);
      if (payload.type === 'verify') {
        setError('');
        onVerify(payload.token);
      } else if (payload.type === 'expire') {
        onVerify('');
      } else if (payload.type === 'error') {
        setError('CAPTCHA failed to load. Please check your connection.');
      }
    } catch {
      // Ignore malformed messages.
    }
  };

  return (
    // Requesting Cloudflare's 'compact' size didn't help - confirmed live
    // that this widget renders at its normal ~300x65 footprint regardless
    // of the requested size (the dashboard-configured widget mode overrides
    // it). Sized to comfortably fit that, full card width rather than a
    // fixed px value so it scales with the device. scrollEnabled is
    // deliberately NOT disabled here (unlike the first version) - on a
    // narrow device where the widget still doesn't fully fit, scrolling is
    // the fallback that keeps the checkbox and branding reachable instead
    // of invisibly clipped with no way to get to them.
    <View style={{ height: 80, width: '100%', alignSelf: 'center' }}>
      <WebView
        key={resetKey}
        originWhitelist={['*']}
        source={{ uri: embedUrl }}
        onMessage={handleMessage}
        onError={() => setError('CAPTCHA failed to load. Please check your connection.')}
        onHttpError={() => setError('CAPTCHA failed to load. Please check your connection.')}
        style={{ backgroundColor: 'transparent' }}
        containerStyle={{ backgroundColor: 'transparent' }}
      />
      {error ? <Text className="text-[#f87171] text-xs mt-1 text-center">{error}</Text> : null}
    </View>
  );
}
