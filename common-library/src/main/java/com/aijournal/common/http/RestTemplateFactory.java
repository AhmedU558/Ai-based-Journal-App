package com.aijournal.common.http;

import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

// Every RestTemplate across the business services used to be a bare `new
// RestTemplate()` with no timeouts at all - a hung downstream call (a slow
// LLM provider, a stalled notification-service SMTP call, python-ai-service
// under load) could block the calling thread indefinitely, one stuck request
// at a time eating into the servlet container's thread pool. This gives
// every caller a RestTemplate with real, bounded connect/read timeouts
// instead of Java's default of "wait forever."
public final class RestTemplateFactory {

    private static final int DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
    private static final int DEFAULT_READ_TIMEOUT_MS = 10_000;

    private RestTemplateFactory() {
    }

    public static RestTemplate create() {
        return create(DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_READ_TIMEOUT_MS);
    }

    public static RestTemplate create(int connectTimeoutMs, int readTimeoutMs) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(connectTimeoutMs);
        factory.setReadTimeout(readTimeoutMs);
        return new RestTemplate(factory);
    }
}
