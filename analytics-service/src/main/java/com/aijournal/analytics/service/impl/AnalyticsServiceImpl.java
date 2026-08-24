package com.aijournal.analytics.service.impl;
import com.aijournal.common.http.RestTemplateFactory;

import com.aijournal.analytics.service.AnalyticsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class AnalyticsServiceImpl implements AnalyticsService {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsServiceImpl.class);
    private static final ParameterizedTypeReference<Map<String, Object>> MAP_RESPONSE_TYPE =
            new ParameterizedTypeReference<>() {
            };
    // Fetched per-page while paging through a user's full journal history
    // (see fetchAllJournals below) - previously a single fixed-size request
    // silently truncated any user's 501st+ journal out of every insight
    // (word counts, streaks, top topics), with no error or indication it
    // had happened.
    private static final int PAGE_SIZE = 200;
    // Safety cap on the number of pages fetched (200 * 100 = 20,000 journals)
    // so a pathological account can't make this loop run indefinitely - a
    // real user's history is expected to be well under this.
    private static final int MAX_PAGES = 100;

    @Value("${journal.service.url:http://journal-service:8083}")
    private String journalServiceUrl;

    private final RestTemplate restTemplate = RestTemplateFactory.create();

    @Override
    public Map<String, Object> getUserJournalInsights(Long userId, String authorizationHeader) {
        List<Map<String, Object>> journals = fetchAllJournals(authorizationHeader);
        int totalEntries = journals.size();

        int totalWordsWritten = journals.stream().mapToInt(this::extractWordCount).sum();
        int averageWordsPerEntry = totalEntries > 0 ? totalWordsWritten / totalEntries : 0;

        Map<String, Long> mostCommonEmotions = journals.stream()
                .map(this::extractMood)
                .collect(Collectors.groupingBy(m -> m, LinkedHashMap::new, Collectors.counting()));

        List<String> topTopics = journals.stream()
                .flatMap(j -> extractTags(j).stream())
                .collect(Collectors.groupingBy(t -> t, Collectors.counting()))
                .entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .limit(5)
                .map(Map.Entry::getKey)
                .collect(Collectors.toList());

        List<LocalDate> entryDays = journals.stream()
                .map(this::extractCreatedAt)
                .filter(Objects::nonNull)
                .map(LocalDateTime::toLocalDate)
                .collect(Collectors.toList());

        Map<DayOfWeek, Long> dayOfWeekCounts = entryDays.stream()
                .collect(Collectors.groupingBy(d -> d.getDayOfWeek(), Collectors.counting()));
        List<String> mostProductiveDays = mostFrequentDays(dayOfWeekCounts);

        String writingFrequency = computeWritingFrequency(entryDays, totalEntries);
        StreakResult streak = computeStreak(entryDays);

        Map<String, Object> insights = new LinkedHashMap<>();
        insights.put("userId", userId);
        insights.put("longestStreakDays", streak.longest());
        insights.put("currentStreakDays", streak.current());
        insights.put("totalWordsWritten", totalWordsWritten);
        insights.put("averageWordsPerEntry", averageWordsPerEntry);
        insights.put("mostCommonEmotions", mostCommonEmotions);
        insights.put("mostProductiveDays", mostProductiveDays);
        insights.put("writingFrequency", writingFrequency);
        insights.put("topTopics", topTopics);
        return insights;
    }

    // Journal-service is the only source of truth for a user's real journals -
    // forwards the caller's own bearer token rather than inventing new
    // service-to-service auth, same pattern already proven by
    // RecommendationServiceImpl. Unreachable/malformed response both fall back
    // to an empty list rather than throwing, so insights degrade to honest
    // zeroed values instead of a 500.
    //
    // Pages through the caller's FULL journal history (bounded by MAX_PAGES)
    // rather than a single fixed-size request - a single page previously
    // silently truncated every insight (word counts, streaks, top topics)
    // at exactly 500 journals for any user with more than that, with no
    // error or indication anything had been left out.
    private List<Map<String, Object>> fetchAllJournals(String authorizationHeader) {
        HttpHeaders headers = new HttpHeaders();
        if (authorizationHeader != null) {
            headers.set(HttpHeaders.AUTHORIZATION, authorizationHeader);
        }
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        List<Map<String, Object>> allJournals = new ArrayList<>();
        int page = 0;
        try {
            while (page < MAX_PAGES) {
                String url = journalServiceUrl + "/api/v1/journals?page=" + page + "&size=" + PAGE_SIZE
                        + "&sortBy=createdAt&sortDir=DESC";
                ResponseEntity<Map<String, Object>> response = restTemplate.exchange(url, HttpMethod.GET, entity, MAP_RESPONSE_TYPE);
                PageResult pageResult = extractPage(response.getBody());
                if (pageResult == null) {
                    break;
                }
                allJournals.addAll(pageResult.content());
                if (pageResult.isLast() || pageResult.content().isEmpty()) {
                    break;
                }
                page++;
            }
        } catch (Exception e) {
            log.warn("Could not fetch journals to compute analytics insights, falling back to what was fetched so far: {}", e.getMessage());
        }
        return allJournals;
    }

    @SuppressWarnings("unchecked")
    private PageResult extractPage(Map<String, Object> body) {
        if (body == null) {
            return null;
        }
        Object data = body.get("data");
        if (!(data instanceof Map)) {
            return null;
        }
        Map<String, Object> dataMap = (Map<String, Object>) data;
        Object content = dataMap.get("content");
        List<Map<String, Object>> contentList = content instanceof List ? (List<Map<String, Object>>) content : List.of();
        boolean isLast = Boolean.TRUE.equals(dataMap.get("last"));
        return new PageResult(contentList, isLast);
    }

    private record PageResult(List<Map<String, Object>> content, boolean isLast) {
    }

    private int extractWordCount(Map<String, Object> journal) {
        Object value = journal.get("wordCount");
        return value instanceof Number ? ((Number) value).intValue() : 0;
    }

    private String extractMood(Map<String, Object> journal) {
        Object value = journal.get("mood");
        return value != null ? String.valueOf(value).toUpperCase() : "NEUTRAL";
    }

    @SuppressWarnings("unchecked")
    private List<String> extractTags(Map<String, Object> journal) {
        Object value = journal.get("tags");
        if (!(value instanceof List)) {
            return List.of();
        }
        return ((List<Object>) value).stream()
                .filter(Objects::nonNull)
                .map(String::valueOf)
                .collect(Collectors.toList());
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

    private List<String> mostFrequentDays(Map<DayOfWeek, Long> counts) {
        if (counts.isEmpty()) {
            return List.of();
        }
        long max = counts.values().stream().mapToLong(Long::longValue).max().orElse(0);
        if (max == 0) {
            return List.of();
        }
        return Arrays.stream(DayOfWeek.values())
                .filter(d -> counts.getOrDefault(d, 0L) == max)
                .map(d -> d.getDisplayName(TextStyle.FULL, Locale.ENGLISH))
                .collect(Collectors.toList());
    }

    private String computeWritingFrequency(List<LocalDate> entryDays, int totalEntries) {
        if (totalEntries == 0 || entryDays.isEmpty()) {
            return "0.0 entries / week";
        }
        LocalDate oldest = entryDays.stream().min(LocalDate::compareTo).orElse(LocalDate.now());
        long daysSinceFirst = ChronoUnit.DAYS.between(oldest, LocalDate.now());
        double weeks = Math.max(1.0, daysSinceFirst / 7.0);
        double frequency = totalEntries / weeks;
        return String.format(Locale.ENGLISH, "%.1f entries / week", frequency);
    }

    // Java port of frontend/src/lib/journalStats.ts's calculateStreak - same
    // algorithm, second language: dedupe to unique calendar days, longest is
    // the longest run of consecutive days ever, current walks backward from
    // today-or-yesterday (so it doesn't zero out mid-day before today's entry
    // is written).
    private StreakResult computeStreak(List<LocalDate> days) {
        if (days.isEmpty()) {
            return new StreakResult(0, 0);
        }
        List<LocalDate> sorted = new ArrayList<>(new TreeSet<>(days));

        int longest = 1;
        int run = 1;
        for (int i = 1; i < sorted.size(); i++) {
            run = ChronoUnit.DAYS.between(sorted.get(i - 1), sorted.get(i)) == 1 ? run + 1 : 1;
            longest = Math.max(longest, run);
        }

        LocalDate mostRecent = sorted.get(sorted.size() - 1);
        long gapFromToday = ChronoUnit.DAYS.between(mostRecent, LocalDate.now());
        if (gapFromToday > 1) {
            return new StreakResult(0, longest);
        }

        int current = 1;
        for (int i = sorted.size() - 1; i > 0; i--) {
            if (ChronoUnit.DAYS.between(sorted.get(i - 1), sorted.get(i)) == 1) {
                current++;
            } else {
                break;
            }
        }
        return new StreakResult(current, longest);
    }

    private record StreakResult(int current, int longest) {
    }
}
