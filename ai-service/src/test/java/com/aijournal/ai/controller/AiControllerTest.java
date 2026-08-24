package com.aijournal.ai.controller;

import com.aijournal.ai.dto.ChatRequest;
import com.aijournal.ai.dto.ContentRequest;
import com.aijournal.ai.dto.RecommendationsRequest;
import com.aijournal.ai.service.AiService;
import com.aijournal.ai.strategy.AiProviderStrategy.SummaryResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiControllerTest {

    @Mock
    private AiService aiService;

    private AiController controller() {
        return new AiController(aiService);
    }

    @Test
    void summarize_DelegatesWithRequestContent() {
        AiController controller = controller();
        ContentRequest request = new ContentRequest();
        request.setContent("my journal entry");
        when(aiService.summarizeJournal("my journal entry")).thenReturn(new SummaryResult("short", "detailed", "bullets"));

        controller.summarize(request);

        verify(aiService).summarizeJournal("my journal entry");
    }

    @Test
    void getRecommendations_MoodOmitted_DefaultsToNeutral() {
        AiController controller = controller();
        RecommendationsRequest request = new RecommendationsRequest();
        request.setContent("content");
        when(aiService.getRecommendations("content", "NEUTRAL")).thenReturn(List.of());

        controller.getRecommendations(request);

        verify(aiService).getRecommendations(eq("content"), eq("NEUTRAL"));
    }

    @Test
    void getRecommendations_MoodProvided_PassesItThrough() {
        AiController controller = controller();
        RecommendationsRequest request = new RecommendationsRequest();
        request.setContent("content");
        request.setMood("STRESSED");
        when(aiService.getRecommendations("content", "STRESSED")).thenReturn(List.of());

        controller.getRecommendations(request);

        verify(aiService).getRecommendations(eq("content"), eq("STRESSED"));
    }

    @Test
    void chatWithJournal_HistoryOmitted_PassesEmptyList() {
        AiController controller = controller();
        ChatRequest request = new ChatRequest();
        request.setQuery("hello");
        when(aiService.chatWithJournal(eq(5L), eq("hello"), eq(""), eq(List.of()), eq(null))).thenReturn("reply");

        controller.chatWithJournal(5L, null, request);

        verify(aiService).chatWithJournal(5L, "hello", "", List.of(), null);
    }

    @Test
    void chatWithJournal_WithHistoryAndContext_PassesThemThrough() {
        AiController controller = controller();
        ChatRequest request = new ChatRequest();
        request.setQuery("what did I say?");
        request.setContext("journal excerpt");
        List<Map<String, String>> history = List.of(Map.of("role", "user", "content", "hi"));
        request.setHistory(history);
        when(aiService.chatWithJournal(eq(5L), eq("what did I say?"), eq("journal excerpt"), eq(history), eq("Bearer token")))
                .thenReturn("reply");

        controller.chatWithJournal(5L, "Bearer token", request);

        verify(aiService).chatWithJournal(5L, "what did I say?", "journal excerpt", history, "Bearer token");
    }
}
