package com.aijournal.ai.service.impl;
import com.aijournal.common.http.RestTemplateFactory;

import com.aijournal.ai.entity.MoodHistory;
import com.aijournal.ai.repository.MoodHistoryRepository;
import com.aijournal.ai.service.AiService;
import com.aijournal.ai.strategy.AiProviderStrategy;
import com.aijournal.ai.strategy.AiProviderStrategy.*;
import com.aijournal.ai.strategy.AiStrategyFactory;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class AiServiceImpl implements AiService {

    private static final Logger log = LoggerFactory.getLogger(AiServiceImpl.class);
    private static final ParameterizedTypeReference<Map<String, Object>> MAP_RESPONSE_TYPE =
            new ParameterizedTypeReference<>() {
            };
    private static final DateTimeFormatter DATE_LABEL = DateTimeFormatter.ofPattern("MMMM d, yyyy");

    // Same mood-bucket grouping recommendation-service already established
    // for "current mood" resolution - reused here so "worst/best mood"
    // questions bucket the same way a human would expect.
    private static final Set<String> POSITIVE_MOODS = Set.of("HAPPY", "EXCITED", "GRATEFUL", "RELAXED");
    private static final Set<String> NEGATIVE_MOODS = Set.of("SAD", "ANGRY", "STRESSED");
    private static final Set<String> ALL_MOODS = Set.of(
            "HAPPY", "EXCITED", "GRATEFUL", "RELAXED", "SAD", "ANGRY", "STRESSED");

    private final AiStrategyFactory aiStrategyFactory;
    private final MoodHistoryRepository moodHistoryRepository;
    private final RestTemplate restTemplate = RestTemplateFactory.create();

    @Value("${journal.service.url:http://journal-service:8083}")
    private String journalServiceUrl;

    public AiServiceImpl(AiStrategyFactory aiStrategyFactory, MoodHistoryRepository moodHistoryRepository) {
        this.aiStrategyFactory = aiStrategyFactory;
        this.moodHistoryRepository = moodHistoryRepository;
    }

    @Override
    public SummaryResult summarizeJournal(String content) {
        return getStrategy().summarize(content);
    }

    @Override
    @Transactional
    public MoodResult detectAndSaveMood(Long userId, Long journalId, String content, String authorizationHeader) {
        // journalId is a caller-supplied request param with no ownership
        // check of its own - verify it actually belongs to userId before
        // persisting a MoodHistory row against it, closing the gap where an
        // authenticated user could otherwise attach fabricated mood data to
        // an arbitrary (including someone else's) journalId. 0/null means
        // "not associated with a saved journal yet" (the real shape both
        // clients' mood-detection-while-typing flow sends today) and skips
        // the check entirely - there's nothing to own yet.
        if (journalId != null && journalId != 0L && !ownsJournal(journalId, authorizationHeader)) {
            throw new com.aijournal.common.exception.ForbiddenException("You do not have access to this journal entry");
        }
        MoodResult result = getStrategy().detectMood(content);
        SentimentResult sentiment = getStrategy().analyzeSentiment(content);

        MoodHistory history = new MoodHistory(
                null,
                journalId,
                userId,
                result.primaryMood(),
                result.confidenceScore(),
                sentiment.sentiment(),
                sentiment.score()
        );
        moodHistoryRepository.save(history);
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public List<MoodHistory> getEmotionTimeline(Long userId, String period) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime start = switch (period.toLowerCase()) {
            case "weekly" -> now.minusDays(7);
            case "monthly" -> now.minusDays(30);
            case "yearly" -> now.minusDays(365);
            default -> now.minusDays(7);
        };
        return moodHistoryRepository.findByUserIdAndCreatedAtBetweenOrderByCreatedAtAsc(userId, start, now);
    }

    @Override
    public List<String> getRecommendations(String content, String mood) {
        return getStrategy().generateRecommendations(content, mood);
    }

    @Override
    public List<String> generateTags(String content) {
        return getStrategy().generateTags(content);
    }

    // Real journal-history retrieval, not a canned reply - "when was I
    // happy"/"when was my worst mood" previously got the exact same
    // mood-bucketed template text every other message with that mood word
    // in it got, with no actual dates or entries behind it (the endpoint's
    // own doc comment already claimed "RAG / AI Memory", which was false).
    // Only questions that are actually ASKING about mood history (a
    // "when"/"how many times" framing) take this path - a message that just
    // mentions a mood in passing ("I'm sad today") still gets the
    // strategy's normal supportive reply, not a data dump.
    @Override
    public String chatWithJournal(Long userId, String query, String context, List<Map<String, String>> history, String authorizationHeader) {
        Set<String> targetMoods = detectMoodHistoryIntent(query);
        if (targetMoods != null) {
            String grounded = answerMoodHistoryQuery(targetMoods, authorizationHeader);
            if (grounded != null) {
                return grounded;
            }
            // Fetch failed (journal-service unreachable, etc.) - fall through
            // to the normal strategy reply rather than surfacing an error.
        }
        return getStrategy().chatWithJournal(query, context, history);
    }

    private Set<String> detectMoodHistoryIntent(String query) {
        if (query == null || query.isBlank()) {
            return null;
        }
        String q = query.toLowerCase();
        boolean isTemporalQuestion = q.matches(".*\\b(when|what day|which day|how many times|how often)\\b.*");
        if (!isTemporalQuestion) {
            return null;
        }
        boolean mentionsMood = q.contains("mood") || q.contains("feel") || q.contains("felt")
                || ALL_MOODS.stream().anyMatch(m -> q.contains(m.toLowerCase()));
        if (!mentionsMood) {
            return null;
        }
        if (q.matches(".*\\b(worst|bad|lowest|negative|down|struggl\\w*)\\b.*")) {
            return NEGATIVE_MOODS;
        }
        if (q.matches(".*\\b(best|good|great|happiest|positive)\\b.*")) {
            return POSITIVE_MOODS;
        }
        for (String mood : ALL_MOODS) {
            if (q.contains(mood.toLowerCase())) {
                return Set.of(mood);
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private String answerMoodHistoryQuery(Set<String> targetMoods, String authorizationHeader) {
        List<Map<String, Object>> journals;
        try {
            journals = fetchJournals(authorizationHeader);
        } catch (Exception e) {
            log.warn("Could not fetch journal history to answer a mood-history question, falling back: {}", e.getMessage());
            return null;
        }

        List<Map<String, Object>> matches = journals.stream()
                .filter(j -> targetMoods.contains(String.valueOf(j.get("mood")).toUpperCase()))
                .sorted(Comparator.comparing(this::extractCreatedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .collect(Collectors.toList());

        String moodLabel = describeMoods(targetMoods);
        if (matches.isEmpty()) {
            return "I looked through your journal entries and didn't find any marked " + moodLabel
                    + " yet. As you keep journaling, I'll be able to point you to specific days.";
        }

        Map<String, Object> mostRecent = matches.get(0);
        StringBuilder sb = new StringBuilder();
        sb.append("You've had ").append(matches.size())
                .append(matches.size() == 1 ? " entry" : " entries")
                .append(" marked ").append(moodLabel).append(". ");
        sb.append("Most recently on ").append(formatDate(mostRecent))
                .append(", you wrote \"").append(truncate(String.valueOf(mostRecent.getOrDefault("title", "")), 60)).append("\"");
        String excerpt = truncate(String.valueOf(mostRecent.getOrDefault("content", "")), 140);
        if (!excerpt.isBlank() && !"null".equals(excerpt)) {
            sb.append(": \"").append(excerpt).append("\"");
        }
        sb.append(".");

        if (matches.size() > 1) {
            List<String> otherDates = matches.stream()
                    .skip(1)
                    .limit(4)
                    .map(this::formatDate)
                    .collect(Collectors.toList());
            sb.append(" Other dates: ").append(String.join(", ", otherDates));
            if (matches.size() > 5) {
                sb.append(", and ").append(matches.size() - 5).append(" more");
            }
            sb.append(".");
        }
        return sb.toString();
    }

    private String describeMoods(Set<String> moods) {
        if (moods.equals(NEGATIVE_MOODS)) {
            return "as a difficult mood (sad, angry, or stressed)";
        }
        if (moods.equals(POSITIVE_MOODS)) {
            return "as a good mood (happy, excited, grateful, or relaxed)";
        }
        return moods.iterator().next();
    }

    private LocalDateTime extractCreatedAt(Map<String, Object> journal) {
        Object value = journal.get("createdAt");
        if (!(value instanceof String)) {
            return null;
        }
        try {
            return LocalDateTime.parse((String) value);
        } catch (Exception e) {
            return null;
        }
    }

    private String formatDate(Map<String, Object> journal) {
        LocalDateTime createdAt = extractCreatedAt(journal);
        return createdAt != null ? createdAt.format(DATE_LABEL) : "an unknown date";
    }

    private String truncate(String text, int maxLen) {
        if (text == null) {
            return "";
        }
        String trimmed = text.trim();
        return trimmed.length() > maxLen ? trimmed.substring(0, maxLen).trim() + "..." : trimmed;
    }

    @SuppressWarnings("unchecked")
    // GET /api/v1/journals/{id} is already ownership-scoped by journal-service
    // itself (404s for a journal the forwarded token's user doesn't own), so
    // a 2xx response is sufficient proof of ownership - matches how every
    // other cross-service call in this class forwards the caller's own token
    // rather than trusting a client-supplied id directly.
    private boolean ownsJournal(Long journalId, String authorizationHeader) {
        HttpHeaders headers = new HttpHeaders();
        if (authorizationHeader != null) {
            headers.set(HttpHeaders.AUTHORIZATION, authorizationHeader);
        }
        try {
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    journalServiceUrl + "/api/v1/journals/" + journalId,
                    HttpMethod.GET, new HttpEntity<>(headers), MAP_RESPONSE_TYPE);
            return response.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            // 404 (not found/not owned) and any other failure both mean "no
            // proof of ownership" - fail closed, not open.
            return false;
        }
    }

    private List<Map<String, Object>> fetchJournals(String authorizationHeader) {
        // 200 is a pragmatic "effectively all, for a demo-scale app" fetch,
        // same tradeoff analytics-service already made for its own
        // full-history computations.
        String url = journalServiceUrl + "/api/v1/journals?page=0&size=200&sortBy=createdAt&sortDir=DESC";
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

    @Override
    public RephraseResult rephrase(String content) {
        return getStrategy().rephrase(content);
    }

    @Override
    public GrammarResult fixGrammar(String content) {
        return getStrategy().fixGrammar(content);
    }

    private AiProviderStrategy getStrategy() {
        return aiStrategyFactory.getActiveStrategy();
    }
}
