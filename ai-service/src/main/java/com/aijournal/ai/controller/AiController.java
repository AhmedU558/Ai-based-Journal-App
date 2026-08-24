package com.aijournal.ai.controller;

import com.aijournal.ai.dto.ChatRequest;
import com.aijournal.ai.dto.ContentRequest;
import com.aijournal.ai.dto.RecommendationsRequest;
import com.aijournal.ai.entity.MoodHistory;
import com.aijournal.ai.service.AiService;
import com.aijournal.ai.strategy.AiProviderStrategy.*;
import com.aijournal.common.dto.ApiResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/ai")
@Tag(name = "AI Features API", description = "Summaries, Mood Detection with Emojis, Recommendations, Auto-Tags, and AI Chat")
public class AiController {

    private final AiService aiService;

    public AiController(AiService aiService) {
        this.aiService = aiService;
    }

    @PostMapping("/summarize")
    @Operation(summary = "Generate Short, Detailed, and Bullet Journal Summaries")
    public ResponseEntity<ApiResponse<SummaryResult>> summarize(@Valid @RequestBody ContentRequest request) {
        SummaryResult result = aiService.summarizeJournal(request.getContent());
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @PostMapping("/mood")
    @Operation(summary = "Detect Mood (Happy, Sad, Anxious, Angry, Stress, etc.) with Confidence Score and Emoji")
    public ResponseEntity<ApiResponse<MoodResult>> detectMood(
            @RequestHeader("X-User-Id") Long userId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestParam(required = false) Long journalId,
            @Valid @RequestBody ContentRequest request) {
        MoodResult result = aiService.detectAndSaveMood(userId, journalId != null ? journalId : 0L, request.getContent(), authorizationHeader);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @GetMapping("/emotion-timeline")
    @Operation(summary = "Get Weekly, Monthly, or Yearly Emotional Analytics Timeline")
    public ResponseEntity<ApiResponse<List<MoodHistory>>> getEmotionTimeline(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(defaultValue = "weekly") String period) {
        List<MoodHistory> timeline = aiService.getEmotionTimeline(userId, period);
        return ResponseEntity.ok(ApiResponse.success(timeline));
    }

    @PostMapping("/recommendations")
    @Operation(summary = "Generate Context-Aware AI Recommendations (Walk, Meditate, Sleep early, etc.)")
    public ResponseEntity<ApiResponse<List<String>>> getRecommendations(@Valid @RequestBody RecommendationsRequest request) {
        String mood = request.getMood() != null ? request.getMood() : "NEUTRAL";
        List<String> recommendations = aiService.getRecommendations(request.getContent(), mood);
        return ResponseEntity.ok(ApiResponse.success(recommendations));
    }

    @PostMapping("/tags")
    @Operation(summary = "Auto-Generate Journal Tags (#career, #health, #family, etc.)")
    public ResponseEntity<ApiResponse<List<String>>> generateTags(@Valid @RequestBody ContentRequest request) {
        List<String> tags = aiService.generateTags(request.getContent());
        return ResponseEntity.ok(ApiResponse.success(tags));
    }

    @PostMapping("/chat")
    @Operation(summary = "Chat with your Journal History (RAG / AI Memory)")
    public ResponseEntity<ApiResponse<String>> chatWithJournal(
            @RequestHeader("X-User-Id") Long userId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @Valid @RequestBody ChatRequest request) {
        String context = request.getContext() != null ? request.getContext() : "";
        // Prior conversation turns, oldest first - without this, a real LLM
        // provider has no memory of the conversation and evaluates every
        // message in isolation (see AiProviderStrategy.chatWithJournal).
        List<Map<String, String>> history = request.getHistory() != null ? request.getHistory() : List.of();
        String answer = aiService.chatWithJournal(userId, request.getQuery(), context, history, authorizationHeader);
        return ResponseEntity.ok(ApiResponse.success("AI Response generated", answer));
    }

    @PostMapping("/rephrase")
    @Operation(summary = "Rephrase Journal Text via AI")
    public ResponseEntity<ApiResponse<RephraseResult>> rephrase(@Valid @RequestBody ContentRequest request) {
        RephraseResult result = aiService.rephrase(request.getContent());
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @PostMapping("/grammar")
    @Operation(summary = "Fix Grammar & Spelling via AI")
    public ResponseEntity<ApiResponse<GrammarResult>> fixGrammar(@Valid @RequestBody ContentRequest request) {
        GrammarResult result = aiService.fixGrammar(request.getContent());
        return ResponseEntity.ok(ApiResponse.success(result));
    }
}
