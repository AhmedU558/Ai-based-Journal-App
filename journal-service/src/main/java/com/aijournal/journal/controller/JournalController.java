package com.aijournal.journal.controller;

import com.aijournal.common.dto.ApiResponse;
import com.aijournal.common.dto.PagedResponse;
import com.aijournal.journal.dto.JournalRequest;
import com.aijournal.journal.entity.Journal;
import com.aijournal.journal.service.JournalService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/journals")
@Tag(name = "Journal Management API", description = "CRUD operations, Drafts, Pinned, Favorites, Archive, Soft/Permanent Delete, Tags & Metrics")
public class JournalController {

    private final JournalService journalService;

    public JournalController(JournalService journalService) {
        this.journalService = journalService;
    }

    // X-User-Id is now a required header (Spring rejects a missing one with a
    // clean 400 before this class ever runs) - it used to be optional with a
    // silent fallback to user 1, which was reachable only if a request ever
    // got past auth without the header being set, since common-library's
    // JwtAuthenticationFilter always derives and force-sets this header from
    // the verified JWT for every authenticated request. Kept as a named
    // method (not inlined at each call site) purely to keep this change's
    // diff small against the many call sites below.
    private Long resolveUserId(Long userId) {
        return userId;
    }

    // Builds the entity from the request-only DTO rather than letting Jackson
    // deserialize the client's JSON straight onto a Journal - id/version/
    // userId/contentEncrypted/wordCount/timestamps/isDeleted are structurally
    // absent from JournalRequest, so they can never come from client input at
    // all, independent of JournalServiceImpl's own defensive resets.
    private Journal toEntity(JournalRequest request) {
        Journal journal = new Journal();
        journal.setTitle(request.getTitle());
        journal.setContent(request.getContent());
        journal.setMood(request.getMood());
        journal.setTags(request.getTags());
        journal.setLocation(request.getLocation());
        journal.setWeather(request.getWeather());
        journal.setIsDraft(request.getIsDraft());
        journal.setFolderId(request.getFolderId());
        journal.setCategoryId(request.getCategoryId());
        return journal;
    }

    @PostMapping
    @Operation(summary = "Create a new journal entry or draft")
    public ResponseEntity<ApiResponse<Journal>> createJournal(
            @RequestHeader("X-User-Id") Long userId,
            @Valid @RequestBody JournalRequest request) {
        Long activeUserId = resolveUserId(userId);
        Journal created = journalService.createJournal(activeUserId, toEntity(request));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Journal entry created successfully", created));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update an existing journal entry")
    public ResponseEntity<ApiResponse<Journal>> updateJournal(
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable Long id,
            @Valid @RequestBody JournalRequest request) {
        Long activeUserId = resolveUserId(userId);
        Journal updated = journalService.updateJournal(activeUserId, id, toEntity(request));
        return ResponseEntity.ok(ApiResponse.success("Journal entry updated successfully", updated));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get journal entry by ID")
    public ResponseEntity<ApiResponse<Journal>> getJournalById(
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable Long id) {
        Long activeUserId = resolveUserId(userId);
        Journal journal = journalService.getJournalById(activeUserId, id);
        return ResponseEntity.ok(ApiResponse.success(journal));
    }

    @GetMapping
    @Operation(summary = "Get all active journals with pagination")
    public ResponseEntity<ApiResponse<PagedResponse<Journal>>> getUserJournals(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "createdAt") String sortBy,
            @RequestParam(defaultValue = "DESC") String sortDir) {

        Long activeUserId = resolveUserId(userId);
        Sort sort = sortDir.equalsIgnoreCase("ASC") ? Sort.by(sortBy).ascending() : Sort.by(sortBy).descending();
        PagedResponse<Journal> journals = journalService.getUserJournals(activeUserId, PageRequest.of(page, size, sort));
        return ResponseEntity.ok(ApiResponse.success(journals));
    }

    @GetMapping("/pinned")
    @Operation(summary = "Get pinned journals")
    public ResponseEntity<ApiResponse<PagedResponse<Journal>>> getPinnedJournals(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Long activeUserId = resolveUserId(userId);
        PagedResponse<Journal> journals = journalService.getPinnedJournals(activeUserId, PageRequest.of(page, size));
        return ResponseEntity.ok(ApiResponse.success(journals));
    }

    @GetMapping("/favorites")
    @Operation(summary = "Get favorite journals")
    public ResponseEntity<ApiResponse<PagedResponse<Journal>>> getFavoriteJournals(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Long activeUserId = resolveUserId(userId);
        PagedResponse<Journal> journals = journalService.getFavoriteJournals(activeUserId, PageRequest.of(page, size));
        return ResponseEntity.ok(ApiResponse.success(journals));
    }

    @GetMapping("/archived")
    @Operation(summary = "Get archived journals")
    public ResponseEntity<ApiResponse<PagedResponse<Journal>>> getArchivedJournals(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Long activeUserId = resolveUserId(userId);
        PagedResponse<Journal> journals = journalService.getArchivedJournals(activeUserId, PageRequest.of(page, size));
        return ResponseEntity.ok(ApiResponse.success(journals));
    }

    @PatchMapping("/{id}/pin")
    @Operation(summary = "Toggle pin status")
    public ResponseEntity<ApiResponse<Journal>> togglePin(@RequestHeader("X-User-Id") Long userId, @PathVariable Long id) {
        Long activeUserId = resolveUserId(userId);
        return ResponseEntity.ok(ApiResponse.success("Pin status updated", journalService.togglePin(activeUserId, id)));
    }

    @PatchMapping("/{id}/favorite")
    @Operation(summary = "Toggle favorite status")
    public ResponseEntity<ApiResponse<Journal>> toggleFavorite(@RequestHeader("X-User-Id") Long userId, @PathVariable Long id) {
        Long activeUserId = resolveUserId(userId);
        return ResponseEntity.ok(ApiResponse.success("Favorite status updated", journalService.toggleFavorite(activeUserId, id)));
    }

    @PatchMapping("/{id}/archive")
    @Operation(summary = "Toggle archive status")
    public ResponseEntity<ApiResponse<Journal>> toggleArchive(@RequestHeader("X-User-Id") Long userId, @PathVariable Long id) {
        Long activeUserId = resolveUserId(userId);
        return ResponseEntity.ok(ApiResponse.success("Archive status updated", journalService.toggleArchive(activeUserId, id)));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Soft delete journal entry")
    public ResponseEntity<ApiResponse<Void>> softDeleteJournal(@RequestHeader("X-User-Id") Long userId, @PathVariable Long id) {
        Long activeUserId = resolveUserId(userId);
        journalService.softDeleteJournal(activeUserId, id);
        return ResponseEntity.ok(ApiResponse.success("Journal soft deleted successfully", null));
    }

    @DeleteMapping("/{id}/permanent")
    @Operation(summary = "Permanently delete journal entry")
    public ResponseEntity<ApiResponse<Void>> permanentDeleteJournal(@RequestHeader("X-User-Id") Long userId, @PathVariable Long id) {
        Long activeUserId = resolveUserId(userId);
        journalService.permanentDeleteJournal(activeUserId, id);
        return ResponseEntity.ok(ApiResponse.success("Journal permanently deleted", null));
    }

    @DeleteMapping("/all")
    @Operation(summary = "Delete every journal owned by the authenticated user (internal - called by user-service's account-deletion flow)")
    public ResponseEntity<ApiResponse<Void>> deleteAllJournalsForUser(
            // Deliberately required, unlike every other endpoint here - the
            // optional-with-1L-fallback convention (resolveUserId) is fine
            // for a single-journal operation but far too dangerous for a
            // bulk wipe-everything endpoint: a caller that forgot the header
            // would silently delete user 1's entire journal history instead
            // of failing loudly.
            @RequestHeader("X-User-Id") Long userId) {
        journalService.deleteAllJournalsForUser(userId);
        return ResponseEntity.ok(ApiResponse.success("All journals deleted", null));
    }
}
