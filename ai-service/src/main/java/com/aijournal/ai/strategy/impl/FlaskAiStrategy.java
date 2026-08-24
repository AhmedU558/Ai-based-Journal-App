package com.aijournal.ai.strategy.impl;

import com.aijournal.ai.strategy.AiProviderStrategy;
import com.aijournal.common.http.RestTemplateFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.Collections;
import java.util.List;
import java.util.Map;

@Component("flaskAiStrategy")
public class FlaskAiStrategy implements AiProviderStrategy {

    private static final Logger log = LoggerFactory.getLogger(FlaskAiStrategy.class);
    private static final ParameterizedTypeReference<Map<String, Object>> MAP_RESPONSE_TYPE = new ParameterizedTypeReference<>() {
    };
    private static final String CONTENT_KEY = "content";
    // Longer read timeout than the platform default (10s) - these calls can
    // go through python-ai-service's own Gemini/Claude fallback chain
    // (primary provider, then a fallback provider, then a keyword-based
    // reply), which can genuinely take longer than a typical internal
    // service-to-service call.
    private static final int FLASK_READ_TIMEOUT_MS = 30_000;

    @Value("${ai.flask.url:http://python-ai-service:5000}")
    private String flaskBaseUrl;

    private final RestTemplate restTemplate = RestTemplateFactory.create(5_000, FLASK_READ_TIMEOUT_MS);

    @Override
    public String getProviderName() {
        return "flask";
    }

    @Override
    public SummaryResult summarize(String content) {
        try {
            String url = flaskBaseUrl + "/api/v1/ai/summarize";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, String>> entity = new HttpEntity<>(Map.of(CONTENT_KEY, content), headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(url, HttpMethod.POST, entity,
                    MAP_RESPONSE_TYPE);
            Map<String, Object> body = response.getBody();
            if (response.getStatusCode().is2xxSuccessful() && body != null) {
                Map<String, Object> data = castToMap(body.get("data"));
                if (!data.isEmpty()) {
                    List<String> bullets = castToListOfString(data.get("bulletPoints"));
                    String bulletStr = !bullets.isEmpty() ? String.join("\n", bullets) : "• Logged entry.";
                    return new SummaryResult(
                            (String) data.get("shortSummary"),
                            (String) data.get("detailedSummary"),
                            bulletStr);
                }
            }
        } catch (Exception e) {
            log.warn("summarize call to python-ai-service failed, falling back to raw content: {}", e.getMessage());
        }
        return new SummaryResult(content, content, "• Logged entry.");
    }

    @Override
    public MoodResult detectMood(String content) {
        try {
            String url = flaskBaseUrl + "/api/v1/ai/mood";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, String>> entity = new HttpEntity<>(Map.of(CONTENT_KEY, content), headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(url, HttpMethod.POST, entity,
                    MAP_RESPONSE_TYPE);
            Map<String, Object> body = response.getBody();
            if (response.getStatusCode().is2xxSuccessful() && body != null) {
                Map<String, Object> data = castToMap(body.get("data"));
                if (!data.isEmpty()) {
                    String mood = (String) data.get("primaryMood");
                    Double score = data.get("confidenceScore") != null
                            ? ((Number) data.get("confidenceScore")).doubleValue()
                            : 0.85;
                    String emoji = (String) data.get("emoji");
                    return new MoodResult(mood, score, emoji);
                }
            }
        } catch (Exception e) {
            log.warn("detectMood call to python-ai-service failed, falling back to NEUTRAL: {}", e.getMessage());
        }
        // NEUTRAL at 0.0 confidence - not a fabricated real-looking result. This
        // gets persisted permanently to mood_history via AiServiceImpl.detectAndSaveMood,
        // so a fake HAPPY/90% here would be indistinguishable from a real detection.
        // 0.0 confidence makes this fallback trivially recognizable as "no real
        // detection happened" by anyone who later looks at the stored data.
        return new MoodResult("NEUTRAL", 0.0, "😐");
    }

    @Override
    public List<String> generateRecommendations(String content, String mood) {
        try {
            String url = flaskBaseUrl + "/api/v1/ai/recommendations";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, String>> entity = new HttpEntity<>(Map.of("mood", mood != null ? mood : "NEUTRAL"),
                    headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(url, HttpMethod.POST, entity,
                    MAP_RESPONSE_TYPE);
            Map<String, Object> body = response.getBody();
            if (response.getStatusCode().is2xxSuccessful() && body != null) {
                Map<String, Object> data = castToMap(body.get("data"));
                if (!data.isEmpty() && data.get("recommendations") != null) {
                    List<String> recommendations = castToListOfString(data.get("recommendations"));
                    if (!recommendations.isEmpty()) {
                        return recommendations;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("generateRecommendations call to python-ai-service failed, falling back to defaults: {}", e.getMessage());
        }
        return List.of("Take 5 deep breaths.", "Reflect on 3 good things today.");
    }

    @Override
    public List<String> generateTags(String content) {
        try {
            String url = flaskBaseUrl + "/api/v1/ai/tags";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, String>> entity = new HttpEntity<>(Map.of(CONTENT_KEY, content), headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(url, HttpMethod.POST, entity,
                    MAP_RESPONSE_TYPE);
            Map<String, Object> body = response.getBody();
            if (response.getStatusCode().is2xxSuccessful() && body != null) {
                Map<String, Object> data = castToMap(body.get("data"));
                if (!data.isEmpty() && data.get("tags") != null) {
                    List<String> tags = castToListOfString(data.get("tags"));
                    if (!tags.isEmpty()) {
                        return tags;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("generateTags call to python-ai-service failed, falling back to defaults: {}", e.getMessage());
        }
        return List.of("#journal", "#reflection");
    }

    @Override
    public String chatWithJournal(String query, String context, List<Map<String, String>> history) {
        try {
            String url = flaskBaseUrl + "/api/v1/ai/chat";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            // context was previously accepted by this method's signature but never
            // actually forwarded to python-ai-service - the chat endpoint had no way
            // to be journal-aware even when a caller supplied real context. history
            // (prior conversation turns) is forwarded the same way - without it, a
            // real LLM provider has no memory of the conversation.
            Map<String, Object> requestBody = new java.util.HashMap<>();
            requestBody.put("query", query);
            requestBody.put("context", context != null ? context : "");
            requestBody.put("history", history != null ? history : List.of());
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(url, HttpMethod.POST, entity,
                    MAP_RESPONSE_TYPE);
            Map<String, Object> body = response.getBody();
            if (response.getStatusCode().is2xxSuccessful() && body != null) {
                Map<String, Object> data = castToMap(body.get("data"));
                if (!data.isEmpty() && data.get("response") != null) {
                    return (String) data.get("response");
                }
            }
        } catch (Exception e) {
            log.warn("chatWithJournal call to python-ai-service failed, falling back to generic response: {}", e.getMessage());
        }
        return "AI response to: " + query;
    }

    @Override
    public SentimentResult analyzeSentiment(String content) {
        try {
            String url = flaskBaseUrl + "/api/v1/ai/sentiment";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, String>> entity = new HttpEntity<>(Map.of(CONTENT_KEY, content), headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(url, HttpMethod.POST, entity,
                    MAP_RESPONSE_TYPE);
            Map<String, Object> body = response.getBody();
            if (response.getStatusCode().is2xxSuccessful() && body != null) {
                Map<String, Object> data = castToMap(body.get("data"));
                if (!data.isEmpty() && data.get("sentiment") != null) {
                    String sentiment = (String) data.get("sentiment");
                    double score = data.get("score") != null ? ((Number) data.get("score")).doubleValue() : 0.5;
                    return new SentimentResult(sentiment, score);
                }
            }
        } catch (Exception e) {
            log.warn("analyzeSentiment call to python-ai-service failed, falling back to NEUTRAL: {}", e.getMessage());
        }
        // NEUTRAL at 0.0 confidence, not a fabricated POSITIVE - same reasoning
        // as detectMood's fallback: this gets persisted to mood_history.sentiment
        // permanently, so a fixed non-zero-confidence value here would be
        // indistinguishable from a real classification.
        return new SentimentResult("NEUTRAL", 0.0);
    }

    @Override
    public RephraseResult rephrase(String content) {
        try {
            String url = flaskBaseUrl + "/api/v1/ai/rephrase";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, String>> entity = new HttpEntity<>(Map.of(CONTENT_KEY, content), headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(url, HttpMethod.POST, entity,
                    MAP_RESPONSE_TYPE);
            Map<String, Object> body = response.getBody();
            if (response.getStatusCode().is2xxSuccessful() && body != null) {
                Map<String, Object> data = castToMap(body.get("data"));
                if (!data.isEmpty() && data.get("rephrased") != null) {
                    return new RephraseResult(content, (String) data.get("rephrased"));
                }
            }
        } catch (Exception e) {
            log.warn("rephrase call to python-ai-service failed, falling back to original content: {}", e.getMessage());
        }
        return new RephraseResult(content, content);
    }

    @Override
    public GrammarResult fixGrammar(String content) {
        try {
            String url = flaskBaseUrl + "/api/v1/ai/grammar";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, String>> entity = new HttpEntity<>(Map.of(CONTENT_KEY, content), headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(url, HttpMethod.POST, entity,
                    MAP_RESPONSE_TYPE);
            Map<String, Object> body = response.getBody();
            if (response.getStatusCode().is2xxSuccessful() && body != null) {
                Map<String, Object> data = castToMap(body.get("data"));
                if (!data.isEmpty() && data.get("corrected") != null) {
                    return new GrammarResult(content, (String) data.get("corrected"));
                }
            }
        } catch (Exception e) {
            log.warn("fixGrammar call to python-ai-service failed, falling back to original content: {}", e.getMessage());
        }
        return new GrammarResult(content, content);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> castToMap(Object obj) {
        if (obj instanceof Map) {
            return (Map<String, Object>) obj;
        }
        return Collections.emptyMap();
    }

    @SuppressWarnings("unchecked")
    private List<String> castToListOfString(Object obj) {
        if (obj instanceof List) {
            return (List<String>) obj;
        }
        return Collections.emptyList();
    }
}
