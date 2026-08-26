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

// Fallback height for the gap between mount and the embed page reporting its
// real size - roughly the passive widget's footprint, so the form does not
// visibly jump on a normal load.
const FALLBACK_HEIGHT = 72;

export function TurnstileGate({ action, onVerify, resetKey }: TurnstileGateProps) {
  const [error, setError] = useState('');
  // Driven by the 'size' message from the embed page rather than hardcoded:
  // the widget's height varies with screen width (it scales itself down to
  // fit) and with whether Cloudflare escalates to an interactive challenge,
  // which is taller. A fixed height clipped the tall case and left dead space
  // in the short one.
  const [height, setHeight] = useState(FALLBACK_HEIGHT);

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
      if (payload.type === 'size') {
        const reported = Number(payload.height);
        // Guard against a bogus/zero measurement collapsing the widget out of
        // view; the upper bound stops a runaway value eating the whole form.
        if (Number.isFinite(reported) && reported > 24 && reported < 400) {
          setHeight(Math.ceil(reported));
        }
        return;
      }
      if (payload.type === 'verify') {
        setError('');
        onVerify(payload.token);
      } else if (payload.type === 'expire') {
        onVerify('');
      } else if (payload.type === 'error') {
        // The embed page forwards Cloudflare's error code. Showing it costs
        // the user nothing and turns an unreportable "it just doesn't work"
        // into something diagnosable from a screenshot.
        setError(
          payload.code
            ? `CAPTCHA failed to load (${payload.code}). Please check your connection.`
            : 'CAPTCHA failed to load. Please check your connection.'
        );
      }
    } catch {
      // Ignore malformed messages.
    }
  };

  return (
    // Requesting Cloudflare's 'compact' size didn't help - confirmed live
    // that this widget renders at its normal ~300x65 footprint regardless of
    // the requested size (the dashboard-configured widget mode overrides it).
    // Rather than reserve a fixed box and hope it fits, the embed page scales
    // the widget to the available width and reports the resulting height back
    // (see the 'size' message above), so this container tracks it on any
    // screen size and for either challenge type. Scrolling inside the WebView
    // is disabled now that the content is always made to fit - it existed
    // only as an escape hatch for the clipped state.
    <View style={{ height, width: '100%', alignSelf: 'center' }}>
      <WebView
        key={resetKey}
        originWhitelist={['*']}
        source={{ uri: embedUrl }}
        // Android WebView's stock user agent carries a `wv` token. Turnstile
        // treats that as an embedded/automatable browser and silently refuses
        // to inject its challenge iframe - confirmed by instrumenting the
        // page: the script loads (turnstileLoaded=true) and render() builds
        // the wrapper and hidden cf-turnstile-response input, but ten seconds
        // later the widget div is still empty and iframes=0, with no
        // error-callback, no console error and no onerror. The widget just
        // sits on "Verifying..." forever, so login can never complete.
        //
        // Presenting the same Chrome build without the `wv` token lets the
        // challenge render. This is not an attempt to defeat the check - the
        // challenge still runs, and auth-service still verifies the resulting
        // token server-side via siteverify. It only stops Cloudflare from
        // discarding real users of this app as if they were automation.
        userAgent="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36"
        onMessage={handleMessage}
        scrollEnabled={false}
        onError={() => setError('CAPTCHA failed to load. Please check your connection.')}
        onHttpError={() => setError('CAPTCHA failed to load. Please check your connection.')}
        style={{ backgroundColor: 'transparent' }}
        containerStyle={{ backgroundColor: 'transparent' }}
      />
      {error ? <Text className="text-[#f87171] text-xs mt-1 text-center">{error}</Text> : null}
    </View>
  );
}
