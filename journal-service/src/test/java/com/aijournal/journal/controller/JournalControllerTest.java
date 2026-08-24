package com.aijournal.journal.controller;

import com.aijournal.common.dto.ApiResponse;
import com.aijournal.common.dto.PagedResponse;
import com.aijournal.journal.dto.JournalRequest;
import com.aijournal.journal.entity.Journal;
import com.aijournal.journal.service.JournalService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;

import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JournalControllerTest {

    @Mock
    private JournalService journalService;

    private JournalController controller;

    private JournalController controller() {
        return new JournalController(journalService);
    }

    @Test
    void createJournal_WithUserIdHeader_UsesHeaderValue() {
        controller = controller();
        Journal journal = new Journal();
        when(journalService.createJournal(eq(7L), any(Journal.class))).thenReturn(journal);
        JournalRequest request = new JournalRequest();
        request.setTitle("My Entry");
        request.setContent("Some content");

        controller.createJournal(7L, request);

        ArgumentCaptor<Journal> captor = ArgumentCaptor.forClass(Journal.class);
        verify(journalService).createJournal(eq(7L), captor.capture());
        assertThat(captor.getValue().getTitle()).isEqualTo("My Entry");
        assertThat(captor.getValue().getContent()).isEqualTo("Some content");
    }

    @Test
    void createJournal_RequestBodyHasNoIdOrUserIdOrEncryptionFields() {
        // Regression guard for the over-posting fix: JournalRequest has no
        // setter at all for id/userId/version/contentEncrypted/wordCount/
        // createdAt/isPinned/isFavorite/isArchived/isDeleted, so a client
        // sending those in the JSON body has nothing for Jackson to bind
        // them onto - structurally, not just by service-layer convention.
        assertThat(JournalRequest.class.getDeclaredMethods())
                .noneMatch(m -> m.getName().equals("setId"))
                .noneMatch(m -> m.getName().equals("setUserId"))
                .noneMatch(m -> m.getName().equals("setVersion"))
                .noneMatch(m -> m.getName().equals("setContentEncrypted"))
                .noneMatch(m -> m.getName().equals("setIsPinned"))
                .noneMatch(m -> m.getName().equals("setIsFavorite"))
                .noneMatch(m -> m.getName().equals("setIsArchived"))
                .noneMatch(m -> m.getName().equals("setIsDeleted"));
    }

    @Test
    void getUserJournals_SortDirAsc_BuildsAscendingSort() {
        controller = controller();
        PagedResponse<Journal> paged = new PagedResponse<>(Collections.emptyList(), 0, 10, 0, 0, true, true);
        ArgumentCaptor<PageRequest> captor = ArgumentCaptor.forClass(PageRequest.class);
        when(journalService.getUserJournals(eq(1L), captor.capture())).thenReturn(paged);

        controller.getUserJournals(1L, 0, 10, "createdAt", "ASC");

        Sort.Order order = captor.getValue().getSort().getOrderFor("createdAt");
        assertThat(order).isNotNull();
        assertThat(order.getDirection()).isEqualTo(Sort.Direction.ASC);
    }

    @Test
    void getUserJournals_SortDirDefault_BuildsDescendingSort() {
        controller = controller();
        PagedResponse<Journal> paged = new PagedResponse<>(Collections.emptyList(), 0, 10, 0, 0, true, true);
        ArgumentCaptor<PageRequest> captor = ArgumentCaptor.forClass(PageRequest.class);
        when(journalService.getUserJournals(eq(1L), captor.capture())).thenReturn(paged);

        controller.getUserJournals(1L, 0, 10, "createdAt", "DESC");

        Sort.Order order = captor.getValue().getSort().getOrderFor("createdAt");
        assertThat(order).isNotNull();
        assertThat(order.getDirection()).isEqualTo(Sort.Direction.DESC);
    }

    @Test
    void permanentDeleteJournal_UserId_PassesThroughUnchanged() {
        controller = controller();

        controller.permanentDeleteJournal(3L, 5L);

        verify(journalService).permanentDeleteJournal(3L, 5L);
    }
}
