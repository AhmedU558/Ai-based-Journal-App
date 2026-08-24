package com.aijournal.analytics.service;

import com.aijournal.analytics.service.impl.AnalyticsServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AnalyticsServiceTest {

    @Mock
    private RestTemplate restTemplate;

    private AnalyticsServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new AnalyticsServiceImpl();
        ReflectionTestUtils.setField(service, "restTemplate", restTemplate);
        ReflectionTestUtils.setField(service, "journalServiceUrl", "http://journal-service:8083");
    }

    private static String isoNow() {
        return LocalDateTime.now().toString();
    }

    private static Map<String, Object> journal(int wordCount, String mood, List<String> tags, String createdAt) {
        return Map.<String, Object>of(
                "wordCount", wordCount,
                "mood", mood,
                "tags", tags,
                "createdAt", createdAt
        );
    }

    private static Map<String, Object> journalsResponse(List<Map<String, Object>> journals) {
        // "last": true matches every real journal-service response shape -
        // fetchAllJournals() now pages until it sees this, so a mocked
        // response missing it would make the service loop through
        // MAX_PAGES worth of identical mocked pages instead of stopping
        // after one, duplicating every journal in these fixtures.
        return Map.of("data", Map.of("content", journals, "last", true));
    }

    @SuppressWarnings("unchecked")
    private void mockJournalServiceResponse(Map<String, Object> body) {
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), any(ParameterizedTypeReference.class)))
                .thenReturn(ResponseEntity.ok(body));
    }

    @Test
    void getUserJournalInsights_ComputesRealWordCountsFromFetchedJournals() {
        mockJournalServiceResponse(journalsResponse(List.of(
                journal(100, "HAPPY", List.of(), isoNow()),
                journal(300, "SAD", List.of(), isoNow())
        )));

        Map<String, Object> insights = service.getUserJournalInsights(1L, "Bearer token");

        assertThat(insights.get("totalWordsWritten")).isEqualTo(400);
        assertThat(insights.get("averageWordsPerEntry")).isEqualTo(200);
    }

    @Test
    void getUserJournalInsights_ComputesTopTopicsFromRealTags() {
        mockJournalServiceResponse(journalsResponse(List.of(
                journal(10, "HAPPY", List.of("career", "health"), isoNow()),
                journal(10, "HAPPY", List.of("career"), isoNow()),
                journal(10, "HAPPY", List.of("family"), isoNow())
        )));

        Map<String, Object> insights = service.getUserJournalInsights(1L, "Bearer token");

        @SuppressWarnings("unchecked")
        List<String> topTopics = (List<String>) insights.get("topTopics");
        assertThat(topTopics).first().isEqualTo("career");
        assertThat(topTopics).contains("health", "family");
    }

    @Test
    void getUserJournalInsights_ComputesMostCommonEmotionsFromRealMoods() {
        mockJournalServiceResponse(journalsResponse(List.of(
                journal(10, "HAPPY", List.of(), isoNow()),
                journal(10, "happy", List.of(), isoNow()),
                journal(10, "SAD", List.of(), isoNow())
        )));

        Map<String, Object> insights = service.getUserJournalInsights(1L, "Bearer token");

        @SuppressWarnings("unchecked")
        Map<String, Long> emotions = (Map<String, Long>) insights.get("mostCommonEmotions");
        assertThat(emotions.get("HAPPY")).isEqualTo(2L);
        assertThat(emotions.get("SAD")).isEqualTo(1L);
    }

    @Test
    void getUserJournalInsights_ComputesStreakFromConsecutiveDays() {
        LocalDate today = LocalDate.now();
        mockJournalServiceResponse(journalsResponse(List.of(
                journal(10, "HAPPY", List.of(), today + "T09:00:00"),
                journal(10, "HAPPY", List.of(), today.minusDays(1) + "T09:00:00"),
                journal(10, "HAPPY", List.of(), today.minusDays(2) + "T09:00:00")
        )));

        Map<String, Object> insights = service.getUserJournalInsights(1L, "Bearer token");

        assertThat(insights.get("currentStreakDays")).isEqualTo(3);
        assertThat(insights.get("longestStreakDays")).isEqualTo(3);
    }

    @Test
    void getUserJournalInsights_GapInHistory_CurrentStreakZeroButLongestPreserved() {
        LocalDate today = LocalDate.now();
        mockJournalServiceResponse(journalsResponse(List.of(
                journal(10, "HAPPY", List.of(), today.minusDays(10) + "T09:00:00"),
                journal(10, "HAPPY", List.of(), today.minusDays(11) + "T09:00:00"),
                journal(10, "HAPPY", List.of(), today.minusDays(12) + "T09:00:00")
        )));

        Map<String, Object> insights = service.getUserJournalInsights(1L, "Bearer token");

        assertThat(insights.get("currentStreakDays")).isEqualTo(0);
        assertThat(insights.get("longestStreakDays")).isEqualTo(3);
    }

    @Test
    void getUserJournalInsights_NoJournals_ReturnsZeroedInsightsNotError() {
        mockJournalServiceResponse(journalsResponse(List.of()));

        Map<String, Object> insights = service.getUserJournalInsights(1L, "Bearer token");

        assertThat(insights.get("totalWordsWritten")).isEqualTo(0);
        assertThat(insights.get("averageWordsPerEntry")).isEqualTo(0);
        assertThat(insights.get("currentStreakDays")).isEqualTo(0);
        assertThat(insights.get("longestStreakDays")).isEqualTo(0);
        assertThat(insights.get("writingFrequency")).isEqualTo("0.0 entries / week");
        assertThat((List<?>) insights.get("topTopics")).isEmpty();
        assertThat((List<?>) insights.get("mostProductiveDays")).isEmpty();
    }

    @Test
    void getUserJournalInsights_JournalServiceUnreachable_FallsBackGracefully() {
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), any(ParameterizedTypeReference.class)))
                .thenThrow(new RestClientException("connection refused"));

        Map<String, Object> insights = service.getUserJournalInsights(1L, "Bearer token");

        assertThat(insights.get("totalWordsWritten")).isEqualTo(0);
        assertThat(insights.get("userId")).isEqualTo(1L);
    }

    @Test
    void getUserJournalInsights_DoesNotContainMentionedPeopleOrPlacesKeys() {
        mockJournalServiceResponse(journalsResponse(List.of(journal(10, "HAPPY", List.of(), isoNow()))));

        Map<String, Object> insights = service.getUserJournalInsights(1L, "Bearer token");

        assertThat(insights).doesNotContainKeys("mostMentionedPeople", "mostMentionedPlaces");
    }

    @Test
    void getUserJournalInsights_MoreThanOnePageOfJournals_FetchesAllPagesNotJustTheFirst() {
        // Regression guard: a single fixed-size fetch used to silently
        // truncate every insight at the first page's worth of journals.
        Map<String, Object> page0 = Map.of("data", Map.of(
                "content", List.of(journal(100, "HAPPY", List.of(), isoNow())),
                "last", false));
        Map<String, Object> page1 = Map.of("data", Map.of(
                "content", List.of(journal(50, "SAD", List.of(), isoNow())),
                "last", true));
        when(restTemplate.exchange(org.mockito.ArgumentMatchers.contains("page=0"), eq(HttpMethod.GET), any(HttpEntity.class), any(ParameterizedTypeReference.class)))
                .thenReturn(ResponseEntity.ok(page0));
        when(restTemplate.exchange(org.mockito.ArgumentMatchers.contains("page=1"), eq(HttpMethod.GET), any(HttpEntity.class), any(ParameterizedTypeReference.class)))
                .thenReturn(ResponseEntity.ok(page1));

        Map<String, Object> insights = service.getUserJournalInsights(1L, "Bearer token");

        assertThat(insights.get("totalWordsWritten")).isEqualTo(150);
    }

    @Test
    void getUserJournalInsights_EchoesRequestedUserId() {
        mockJournalServiceResponse(journalsResponse(List.of()));

        Map<String, Object> insights = service.getUserJournalInsights(42L, "Bearer token");

        assertThat(insights.get("userId")).isEqualTo(42L);
    }
}
