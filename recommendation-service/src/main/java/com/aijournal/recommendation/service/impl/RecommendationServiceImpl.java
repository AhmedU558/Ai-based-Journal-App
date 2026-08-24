package com.aijournal.recommendation.service.impl;
import com.aijournal.common.http.RestTemplateFactory;

import com.aijournal.recommendation.service.RecommendationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class RecommendationServiceImpl implements RecommendationService {

    private static final Logger log = LoggerFactory.getLogger(RecommendationServiceImpl.class);
    private static final ParameterizedTypeReference<Map<String, Object>> MAP_RESPONSE_TYPE =
            new ParameterizedTypeReference<>() {
            };

    @Value("${journal.service.url:http://journal-service:8083}")
    private String journalServiceUrl;

    private final RestTemplate restTemplate = RestTemplateFactory.create();

    private enum MoodBucket { POSITIVE, CALM, DISTRESSED, DOWN, NEUTRAL }

    private static final Map<String, MoodBucket> MOOD_TO_BUCKET = Map.of(
            "HAPPY", MoodBucket.POSITIVE,
            "EXCITED", MoodBucket.POSITIVE,
            "GRATEFUL", MoodBucket.POSITIVE,
            "RELAXED", MoodBucket.CALM,
            "STRESSED", MoodBucket.DISTRESSED,
            "ANGRY", MoodBucket.DISTRESSED,
            "SAD", MoodBucket.DOWN
    );

    // Real, mood-differentiated curated content (not AI-generated - same
    // non-AI-fallback pattern used elsewhere in this platform, e.g. Mindora's
    // keyword-matched chat replies). Previously every bucket returned the
    // exact same lists regardless of what mood was passed in - "mood-aware"
    // in name only.
    private static final Map<MoodBucket, Map<String, Object>> CONTENT_BY_BUCKET = Map.of(
            MoodBucket.POSITIVE, Map.of(
                    "recommendedPrompts", List.of(
                            "What is one positive thing that surprised you today?",
                            "Who or what are you most grateful for right now?"),
                    "recommendedBooks", List.of(
                            Map.of("title", "Atomic Habits", "author", "James Clear"),
                            Map.of("title", "The Happiness Project", "author", "Gretchen Rubin")),
                    "recommendedMeditation", List.of(
                            Map.of("title", "Gratitude & Joy Visualization", "duration", "10 mins")),
                    "recommendedMusicPlaylists", List.of("Feel-Good Indie Pop", "Sunny Day Upbeat Mix"),
                    "recommendedExercises", List.of("20-minute Light Jog", "Dance It Out - 15 mins"),
                    "recommendedPodcasts", List.of("On Purpose with Jay Shetty")),
            MoodBucket.CALM, Map.of(
                    "recommendedPrompts", List.of(
                            "What helped you feel at ease today?",
                            "Describe a moment of stillness you'd like to hold onto."),
                    "recommendedBooks", List.of(
                            Map.of("title", "The Power of Now", "author", "Eckhart Tolle")),
                    "recommendedMeditation", List.of(
                            Map.of("title", "Evening Reflection Meditation", "duration", "15 mins")),
                    "recommendedMusicPlaylists", List.of("Peaceful Piano Melodies", "Lo-Fi Calm Study Beats"),
                    "recommendedExercises", List.of("Gentle Evening Yoga Stretch"),
                    "recommendedPodcasts", List.of("The Huberman Lab: Science of Mental Well-being")),
            MoodBucket.DISTRESSED, Map.of(
                    "recommendedPrompts", List.of(
                            "What is one thing currently within your control?",
                            "Write out exactly what's frustrating you, without editing yourself."),
                    "recommendedBooks", List.of(
                            Map.of("title", "Why Zebras Don't Get Ulcers", "author", "Robert M. Sapolsky")),
                    "recommendedMeditation", List.of(
                            Map.of("title", "10-Min Stress Relief Breathing", "duration", "10 mins")),
                    "recommendedMusicPlaylists", List.of("Deep Focus Calm Down"),
                    "recommendedExercises", List.of("Box Breathing - 5 mins", "Brisk Walk to Reset - 15 mins"),
                    "recommendedPodcasts", List.of("Ten Percent Happier")),
            MoodBucket.DOWN, Map.of(
                    "recommendedPrompts", List.of(
                            "Be gentle with yourself - what's one small thing that felt okay today?",
                            "What would you say to a friend feeling the way you feel right now?"),
                    "recommendedBooks", List.of(
                            Map.of("title", "Lost Connections", "author", "Johann Hari")),
                    "recommendedMeditation", List.of(
                            Map.of("title", "Self-Compassion Break", "duration", "8 mins")),
                    "recommendedMusicPlaylists", List.of("Gentle Acoustic Comfort"),
                    "recommendedExercises", List.of("Slow Walk Outside - 10 mins"),
                    "recommendedPodcasts", List.of("The Happiness Lab")),
            MoodBucket.NEUTRAL, Map.of(
                    "recommendedPrompts", List.of(
                            "What is one positive thing that surprised you today?",
                            "What habit helped you feel most accomplished this week?"),
                    "recommendedBooks", List.of(
                            Map.of("title", "Atomic Habits", "author", "James Clear"),
                            Map.of("title", "The Power of Now", "author", "Eckhart Tolle")),
                    "recommendedMeditation", List.of(
                            Map.of("title", "10-Min Stress Relief Breathing", "duration", "10 mins")),
                    "recommendedMusicPlaylists", List.of("Lo-Fi Calm Study Beats", "Peaceful Piano Melodies"),
                    "recommendedExercises", List.of("20-minute Light Jog", "Gentle Evening Yoga Stretch"),
                    "recommendedPodcasts", List.of("On Purpose with Jay Shetty"))
    );

    @Override
    public Map<String, Object> getPersonalizedRecommendations(Long userId, String currentMood, String authorizationHeader) {
        String mood = resolveCurrentMood(currentMood, authorizationHeader);
        MoodBucket bucket = MOOD_TO_BUCKET.getOrDefault(mood, MoodBucket.NEUTRAL);
        Map<String, Object> content = CONTENT_BY_BUCKET.get(bucket);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userId", userId);
        result.put("currentMood", mood);
        result.putAll(content);
        return result;
    }

    // Real, category-differentiated curated prompts - same non-AI-fallback
    // pattern as CONTENT_BY_BUCKET above. Previously every category returned
    // the same 3 hardcoded prompts regardless of what was requested.
    private static final List<String> DEFAULT_PROMPTS = List.of(
            "Write down 3 things you are deeply grateful for today.",
            "Describe a situation that challenged you and how you handled it.",
            "Where do you see yourself mentally and emotionally 6 months from now?"
    );

    private static final Map<String, List<String>> PROMPTS_BY_CATEGORY = Map.of(
            "GRATITUDE", List.of(
                    "Write down 3 things you are deeply grateful for today.",
                    "Who is someone you haven't thanked yet, and why are they on your mind?"),
            "REFLECTION", List.of(
                    "Describe a situation that challenged you and how you handled it.",
                    "What is something you understood differently today than you did yesterday?"),
            "GOALS", List.of(
                    "Where do you see yourself mentally and emotionally 6 months from now?",
                    "What's one small step you can take tomorrow toward a goal that matters to you?")
    );

    @Override
    public List<String> getJournalPrompts(String category) {
        if (category == null || category.isBlank()) {
            return DEFAULT_PROMPTS;
        }
        return PROMPTS_BY_CATEGORY.getOrDefault(category.toUpperCase(), DEFAULT_PROMPTS);
    }

    // Caller-supplied mood always wins. Otherwise, fetch the 5 most recent
    // journals and use the most frequent mood among them (ties broken toward
    // the more recent entry, since the list arrives newest-first and the
    // first-encountered max is kept). No journals, or journal-service
    // unreachable, both fall back to NEUTRAL rather than erroring - same
    // graceful-degradation bar as every other cross-service call in this
    // platform.
    private String resolveCurrentMood(String currentMood, String authorizationHeader) {
        if (currentMood != null && !currentMood.isBlank()) {
            return currentMood.toUpperCase();
        }
        try {
            List<Map<String, Object>> journals = fetchRecentJournals(authorizationHeader);
            if (journals.isEmpty()) {
                return "NEUTRAL";
            }
            Map<String, Long> counts = journals.stream()
                    .map(j -> String.valueOf(j.get("mood")).toUpperCase())
                    .collect(Collectors.groupingBy(m -> m, LinkedHashMap::new, Collectors.counting()));
            return counts.entrySet().stream()
                    .max(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey)
                    .orElse("NEUTRAL");
        } catch (Exception e) {
            log.warn("Could not fetch journals to compute a real current mood, falling back to NEUTRAL: {}", e.getMessage());
            return "NEUTRAL";
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fetchRecentJournals(String authorizationHeader) {
        String url = journalServiceUrl + "/api/v1/journals?page=0&size=5&sortBy=createdAt&sortDir=DESC";
        HttpHeaders headers = new HttpHeaders();
        if (authorizationHeader != null) {
            headers.set(HttpHeaders.AUTHORIZATION, authorizationHeader);
        }
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        ResponseEntity<Map<String, Object>> response = restTemplate.exchange(url, HttpMethod.GET, entity, MAP_RESPONSE_TYPE);
        Map<String, Object> body = response.getBody();
        if (body == null) {
            return List.of();
        }
        Object data = body.get("data");
        if (!(data instanceof Map)) {
            return List.of();
        }
        Object content = ((Map<String, Object>) data).get("content");
        return content instanceof List ? (List<Map<String, Object>>) content : List.of();
    }
}
