package com.aijournal.auth.service;
import com.aijournal.common.http.RestTemplateFactory;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

// Verifies Cloudflare Turnstile CAPTCHA tokens against the real siteverify
// endpoint - closes the "a script can still hammer /register and /login at
// human-plausible speed" gap that per-IP rate limiting alone doesn't fully
// close (rate limiting only throttles volume, not automation itself).
//
// Fails CLOSED (rejects) whenever a token can't be verified as genuinely
// successful - a network blip against Cloudflare's endpoint must not become
// a silent bypass of the one control this class exists to enforce, matching
// this project's established no-fail-open precedent from the gateway's JWT
// filter. The one deliberate exception is an unconfigured secret key (no
// TURNSTILE_SECRET_KEY set at all) - verification is skipped entirely rather
// than permanently blocking every registration/login, so local dev and CI
// environments that never configure a real Turnstile secret keep working.
@Service
public class TurnstileService {

    private static final Logger log = LoggerFactory.getLogger(TurnstileService.class);
    private static final String SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

    private final RestTemplate restTemplate = RestTemplateFactory.create();

    @Value("${turnstile.secret-key:}")
    private String secretKey;

    public boolean verify(String token, String remoteIp) {
        if (!StringUtils.hasText(secretKey)) {
            log.warn("TURNSTILE_SECRET_KEY is not configured - skipping CAPTCHA verification");
            return true;
        }
        if (!StringUtils.hasText(token)) {
            return false;
        }
        try {
            MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
            body.add("secret", secretKey);
            body.add("response", token);
            if (StringUtils.hasText(remoteIp)) {
                body.add("remoteip", remoteIp);
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> result = restTemplate.postForObject(SITEVERIFY_URL, body, Map.class);
            return result != null && Boolean.TRUE.equals(result.get("success"));
        } catch (Exception e) {
            log.warn("Turnstile siteverify call failed, failing closed: {}", e.getMessage());
            return false;
        }
    }
}
