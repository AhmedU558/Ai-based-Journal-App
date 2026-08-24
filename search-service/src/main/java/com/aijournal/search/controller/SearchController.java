package com.aijournal.search.controller;

import com.aijournal.common.dto.ApiResponse;
import com.aijournal.common.dto.PagedResponse;
import com.aijournal.search.document.JournalDocument;
import com.aijournal.search.service.SearchService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/search")
@Tag(name = "Search API", description = "Natural Language Smart Semantic Search & Multi-Filter Fulltext Search")
public class SearchController {

    private final SearchService searchService;

    public SearchController(SearchService searchService) {
        this.searchService = searchService;
    }

    // X-User-Id is now a required header (Spring rejects a missing one with a
    // clean 400 before this class ever runs) - it used to be optional with a
    // silent fallback to user 1, which was reachable only if a request ever
    // got past auth without the header being set, since common-library's
    // JwtAuthenticationFilter always derives and force-sets this header from
    // the verified JWT for every authenticated request. Kept as a named
    // method (not inlined at each call site) purely to keep this change's
    // diff small against the call sites below.
    private Long resolveUserId(Long userId) {
        return userId;
    }

    @GetMapping
    @Operation(summary = "Search user-scoped journals with multi-filters (Date, Mood, Tags, Category)")
    public ResponseEntity<ApiResponse<PagedResponse<JournalDocument>>> search(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String mood,
            @RequestParam(required = false) String tag,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Long activeUserId = resolveUserId(userId);
        PagedResponse<JournalDocument> response = searchService.searchJournals(activeUserId, query, mood, tag, category, page, size);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/semantic")
    @Operation(summary = "Natural Language Smart Semantic Search scoped to current user")
    public ResponseEntity<ApiResponse<PagedResponse<JournalDocument>>> semanticSearch(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Long activeUserId = resolveUserId(userId);
        PagedResponse<JournalDocument> response = searchService.semanticSearch(activeUserId, query, page, size);
        return ResponseEntity.ok(ApiResponse.success("Semantic search results retrieved", response));
    }
}
