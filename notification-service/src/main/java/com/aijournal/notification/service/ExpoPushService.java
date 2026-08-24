package com.aijournal.notification.service;
import com.aijournal.common.http.RestTemplateFactory;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

// Thin wrapper around Expo's push API (https://exp.host/--/api/v2/push/send) -
// takes a list of already-registered Expo push tokens and POSTs one batched
// request. A bad/stale token or an unreachable Expo push service is logged
// and swallowed, not thrown - the caller (NotificationServiceImpl) must not
// break because one of a user's devices has a dead token.
@Component
public class ExpoPushService {

    private static final Logger log = LoggerFactory.getLogger(ExpoPushService.class);

    @Value("${expo.push.url:https://exp.host/--/api/v2/push/send}")
    private String pushUrl;

    private final RestTemplate restTemplate = RestTemplateFactory.create();

    public void sendPush(List<String> expoPushTokens, String title, String body) {
        if (expoPushTokens == null || expoPushTokens.isEmpty()) {
            return;
        }
        try {
            List<Map<String, Object>> messages = expoPushTokens.stream()
                    .map(token -> Map.<String, Object>of("to", token, "title", title, "body", body))
                    .toList();

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<List<Map<String, Object>>> entity = new HttpEntity<>(messages, headers);

            ResponseEntity<String> response = restTemplate.exchange(pushUrl, HttpMethod.POST, entity, String.class);
            if (!response.getStatusCode().is2xxSuccessful()) {
                log.warn("Expo push request returned non-2xx status: {}", response.getStatusCode());
            }
        } catch (Exception e) {
            log.warn("Failed to send Expo push notification: {}", e.getMessage());
        }
    }
}
