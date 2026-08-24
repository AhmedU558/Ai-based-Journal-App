package com.aijournal.journal.service;

import com.aijournal.common.dto.PagedResponse;
import com.aijournal.common.event.JournalCreatedEvent;
import com.aijournal.common.event.JournalDeletedEvent;
import com.aijournal.common.event.JournalUpdatedEvent;
import com.aijournal.common.exception.ResourceNotFoundException;
import com.aijournal.common.messaging.JournalEventRouting;
import com.aijournal.journal.entity.Journal;
import com.aijournal.journal.repository.JournalRepository;
import com.aijournal.journal.service.impl.JournalServiceImpl;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class JournalServiceTest {

    private static final String ENC_PREFIX = "ENC(";

    @Mock
    private JournalRepository journalRepository;

    @Mock
    private RabbitTemplate rabbitTemplate;

    @Mock
    private JournalEncryptionService journalEncryptionService;

    @Mock
    private EntityManager entityManager;

    @InjectMocks
    private JournalServiceImpl journalService;

    private Journal existingJournal(Long id, Long userId) {
        Journal journal = new Journal();
        journal.setId(id);
        journal.setUserId(userId);
        journal.setTitle("Existing");
        journal.setContent("existing content");
        journal.setMood("HAPPY");
        journal.setTags(new HashSet<>());
        journal.setIsPinned(false);
        journal.setIsFavorite(false);
        journal.setIsArchived(false);
        return journal;
    }

    @BeforeEach
    void stubSaveReturnsArgument() {
        // @InjectMocks only performs constructor injection here (a constructor
        // exists), so the @PersistenceContext field never gets set via field
        // injection - wire it explicitly, same pattern used elsewhere in this
        // repo for @Value-injected fields.
        ReflectionTestUtils.setField(journalService, "entityManager", entityManager);
        lenient().when(journalRepository.save(any(Journal.class))).thenAnswer(invocation -> invocation.getArgument(0));
        // Simple, easy-to-assert-against reversible transform standing in for real AES/GCM -
        // JournalEncryptionService itself is covered separately by JournalEncryptionServiceTest.
        lenient().when(journalEncryptionService.encrypt(anyString()))
                .thenAnswer(invocation -> ENC_PREFIX + invocation.getArgument(0) + ")");
        lenient().when(journalEncryptionService.decrypt(anyString())).thenAnswer(invocation -> {
            String value = invocation.getArgument(0);
            return value.startsWith(ENC_PREFIX) && value.endsWith(")")
                    ? value.substring(ENC_PREFIX.length(), value.length() - 1)
                    : value;
        });
    }

    @Test
    void createJournal_BlankTitle_DefaultsToUntitled() {
        Journal input = new Journal();
        input.setTitle("  ");
        input.setContent("some content");

        Journal created = journalService.createJournal(1L, input);

        assertThat(created.getTitle()).isEqualTo("Untitled Journal Entry");
    }

    @Test
    void createJournal_NullFields_AppliesAllDefaults() {
        // Journal's own field initializers already default content/tags/booleans, so this
        // exercises createJournal()'s null-guards on top of those (both should agree).
        Journal input = new Journal();

        Journal created = journalService.createJournal(5L, input);

        assertThat(created.getUserId()).isEqualTo(5L);
        assertThat(created.getContent()).isEqualTo("");
        assertThat(created.getTags()).isNotNull().isEmpty();
        assertThat(created.getIsDraft()).isFalse();
        assertThat(created.getIsPinned()).isFalse();
        assertThat(created.getIsFavorite()).isFalse();
        assertThat(created.getIsArchived()).isFalse();
        // Every new entry is encrypted going forward - only pre-existing rows
        // created before this feature shipped stay contentEncrypted=false.
        assertThat(created.getContentEncrypted()).isTrue();
    }

    @Test
    void createJournal_ExplicitNullMood_DefaultsToHappy() {
        Journal input = new Journal();
        input.setMood(null);

        Journal created = journalService.createJournal(5L, input);

        assertThat(created.getMood()).isEqualTo("HAPPY");
    }

    @Test
    void createJournal_MoodOmitted_AlsoDefaultsToHappy_NotStaleFieldInitializer() {
        // Regression guard: Journal.mood used to have a field initializer
        // ("NEUTRAL"), which made this scenario indistinguishable at the
        // entity level from an explicitly-set mood - the service's own
        // null-guard a few lines below only ever fired when a caller sent a
        // literal "mood": null in the JSON body, never for the far more
        // common case of just omitting the key. Now that the initializer is
        // gone, `new Journal()` with mood never touched is genuinely null,
        // same as the explicit-null case above - both correctly get "HAPPY".
        Journal input = new Journal();

        Journal created = journalService.createJournal(5L, input);

        assertThat(created.getMood()).isEqualTo("HAPPY");
    }

    @Test
    void createJournal_UserId_PassesThroughUnchanged() {
        // X-User-Id is now a required header - the old defaults-to-1L-when-null
        // fallback was removed (common-library's JwtAuthenticationFilter always
        // force-sets this header from the verified JWT, so a genuinely missing
        // header now gets rejected by Spring with a 400 before this method ever
        // runs, rather than silently attributing the journal to user 1).
        Journal input = new Journal();

        Journal created = journalService.createJournal(5L, input);

        assertThat(created.getUserId()).isEqualTo(5L);
    }

    @Test
    void createJournal_Success_PublishesJournalCreatedEvent() {
        Journal input = new Journal();
        input.setTitle("My Entry");
        input.setContent("content");
        input.setMood("HAPPY");
        input.setTags(Set.of("gratitude"));

        journalService.createJournal(9L, input);

        ArgumentCaptor<JournalCreatedEvent> captor = ArgumentCaptor.forClass(JournalCreatedEvent.class);
        verify(rabbitTemplate).convertAndSend(eq(JournalEventRouting.EXCHANGE_NAME), eq(JournalEventRouting.ROUTING_KEY_CREATED), captor.capture());
        assertThat(captor.getValue().getUserId()).isEqualTo(9L);
        assertThat(captor.getValue().getTitle()).isEqualTo("My Entry");
        // Regression guard: the client already finalizes mood/tags before
        // create (no separate async AI step populates them afterward), so
        // the event must carry the real values, not a hardcoded NEUTRAL/[].
        assertThat(captor.getValue().getMood()).isEqualTo("HAPPY");
        assertThat(captor.getValue().getTags()).containsExactly("gratitude");
    }

    @Test
    void createJournal_EncryptsContentBeforeSave_ReturnsDecryptedContentToCaller() {
        // journalRepository.save() returns the very same managed instance that
        // persistAndDecrypt() mutates in place afterward, so an ArgumentCaptor
        // read post-hoc would show the already-decrypted value - snapshot the
        // content string (immutable) at the moment save() is actually called.
        String[] contentAtSaveTime = new String[1];
        Boolean[] encryptedAtSaveTime = new Boolean[1];
        when(journalRepository.save(any(Journal.class))).thenAnswer(invocation -> {
            Journal arg = invocation.getArgument(0);
            contentAtSaveTime[0] = arg.getContent();
            encryptedAtSaveTime[0] = arg.getContentEncrypted();
            return arg;
        });
        Journal input = new Journal();
        input.setTitle("My Entry");
        input.setContent("very private content");

        Journal created = journalService.createJournal(1L, input);

        assertThat(contentAtSaveTime[0]).isEqualTo("ENC(very private content)");
        assertThat(encryptedAtSaveTime[0]).isTrue();
        assertThat(created.getContent()).isEqualTo("very private content");
        assertThat(created.getContentEncrypted()).isTrue();
    }

    @Test
    void createJournal_ComputesWordCountFromRealPlaintextBeforeEncrypting() {
        // Regression guard: calculateMetrics() must run against the real
        // plaintext before encrypt() replaces `content` with ciphertext -
        // otherwise word/char counts silently reflect the ciphertext blob
        // instead of the actual entry.
        Journal input = new Journal();
        input.setTitle("My Entry");
        input.setContent("one two three four five");

        Journal created = journalService.createJournal(1L, input);

        assertThat(created.getWordCount()).isEqualTo(5);
        assertThat(created.getCharacterCount()).isEqualTo(23);
    }

    @Test
    void createJournal_PublishesRabbitMqEventWithPlaintextContent_NotCiphertext() {
        Journal input = new Journal();
        input.setTitle("My Entry");
        input.setContent("very private content");

        journalService.createJournal(9L, input);

        ArgumentCaptor<JournalCreatedEvent> captor = ArgumentCaptor.forClass(JournalCreatedEvent.class);
        verify(rabbitTemplate).convertAndSend(eq(JournalEventRouting.EXCHANGE_NAME), eq(JournalEventRouting.ROUTING_KEY_CREATED), captor.capture());
        assertThat(captor.getValue().getContent()).isEqualTo("very private content");
        assertThat(captor.getValue().getContent()).doesNotStartWith(ENC_PREFIX);
    }

    @Test
    void createJournal_BrokerThrows_ExceptionIsSwallowedAndJournalStillReturned() {
        doThrow(new RuntimeException("broker down")).when(rabbitTemplate).convertAndSend(anyString(), anyString(), any(JournalCreatedEvent.class));
        Journal input = new Journal();
        input.setTitle("My Entry");
        input.setContent("content");

        Journal created = journalService.createJournal(1L, input);

        assertThat(created).isNotNull();
    }

    @Test
    void updateJournal_OwnedJournal_MergesFieldsAndPublishesEvent() {
        Journal existing = existingJournal(10L, 1L);
        when(journalRepository.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(existing));

        Journal updates = new Journal();
        updates.setTitle("New Title");
        updates.setContent("New Content");
        updates.setMood("SAD");
        updates.setTags(Set.of("tag1"));

        Journal result = journalService.updateJournal(1L, 10L, updates);

        assertThat(result.getTitle()).isEqualTo("New Title");
        assertThat(result.getContent()).isEqualTo("New Content");
        assertThat(result.getMood()).isEqualTo("SAD");
        assertThat(result.getTags()).containsExactly("tag1");
        verify(rabbitTemplate).convertAndSend(eq(JournalEventRouting.EXCHANGE_NAME), eq(JournalEventRouting.ROUTING_KEY_UPDATED), any(JournalUpdatedEvent.class));
    }

    @Test
    void updateJournal_EncryptsContentBeforeSave_ReturnsDecryptedContentToCaller() {
        String[] contentAtSaveTime = new String[1];
        when(journalRepository.save(any(Journal.class))).thenAnswer(invocation -> {
            Journal arg = invocation.getArgument(0);
            contentAtSaveTime[0] = arg.getContent();
            return arg;
        });
        Journal existing = existingJournal(10L, 1L);
        when(journalRepository.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(existing));
        Journal updates = new Journal();
        updates.setTitle("New Title");
        updates.setContent("updated private content");

        Journal result = journalService.updateJournal(1L, 10L, updates);

        assertThat(contentAtSaveTime[0]).isEqualTo("ENC(updated private content)");
        assertThat(result.getContent()).isEqualTo("updated private content");
    }

    @Test
    void updateJournal_ComputesWordCountFromRealPlaintextBeforeEncrypting_EvenWhenAlreadyEncrypted() {
        // existing already has contentEncrypted=true from a prior save (set
        // below) - the fix must still recompute from the fresh plaintext, not
        // skip via the ciphertext-guard because the flag was already true.
        Journal existing = existingJournal(10L, 1L);
        existing.setContent("ENC(old ciphertext blob)");
        existing.setContentEncrypted(true);
        when(journalRepository.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(existing));
        Journal updates = new Journal();
        updates.setTitle("New Title");
        updates.setContent("one two three four five six seven");

        Journal result = journalService.updateJournal(1L, 10L, updates);

        assertThat(result.getWordCount()).isEqualTo(7);
    }

    @Test
    void updateJournal_PublishesRabbitMqEventWithPlaintextContent_NotCiphertext() {
        Journal existing = existingJournal(10L, 1L);
        when(journalRepository.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(existing));
        Journal updates = new Journal();
        updates.setTitle("New Title");
        updates.setContent("updated private content");

        journalService.updateJournal(1L, 10L, updates);

        ArgumentCaptor<JournalUpdatedEvent> captor = ArgumentCaptor.forClass(JournalUpdatedEvent.class);
        verify(rabbitTemplate).convertAndSend(eq(JournalEventRouting.EXCHANGE_NAME), eq(JournalEventRouting.ROUTING_KEY_UPDATED), captor.capture());
        assertThat(captor.getValue().getContent()).isEqualTo("updated private content");
        assertThat(captor.getValue().getContent()).doesNotStartWith(ENC_PREFIX);
    }

    @Test
    void updateJournal_PublishesRabbitMqEventWithRealMoodAndTags_NotStaleDefaults() {
        // Regression guard: JournalCreatedEvent/JournalUpdatedEvent used to
        // carry no mood/tags at all, so search-service's index permanently
        // showed NEUTRAL/[] for every journal ever created, and never
        // updated even when the journal's real mood/tags changed - mood/tag
        // search filters returned zero results, always.
        Journal existing = existingJournal(10L, 1L);
        when(journalRepository.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(existing));
        Journal updates = new Journal();
        updates.setMood("EXCITED");
        updates.setTags(Set.of("travel"));

        journalService.updateJournal(1L, 10L, updates);

        ArgumentCaptor<JournalUpdatedEvent> captor = ArgumentCaptor.forClass(JournalUpdatedEvent.class);
        verify(rabbitTemplate).convertAndSend(eq(JournalEventRouting.EXCHANGE_NAME), eq(JournalEventRouting.ROUTING_KEY_UPDATED), captor.capture());
        assertThat(captor.getValue().getMood()).isEqualTo("EXCITED");
        assertThat(captor.getValue().getTags()).containsExactly("travel");
    }

    @Test
    void updateJournal_NotOwnedByCaller_ThrowsResourceNotFoundException() {
        when(journalRepository.findByIdAndUserId(10L, 2L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> journalService.updateJournal(2L, 10L, new Journal()))
                .isInstanceOf(ResourceNotFoundException.class);
        verifyNoInteractions(rabbitTemplate);
    }

    @Test
    void updateJournal_NullContent_KeepsExistingContentInsteadOfCrashing() {
        // Regression guard: a partial-update payload that omits content
        // entirely (content == null) used to NPE inside
        // journalEncryptionService.encrypt(null) - it must instead leave the
        // existing content untouched, matching the skip-if-null convention
        // already used for isDraft/folderId/categoryId below.
        Journal existing = existingJournal(10L, 1L);
        existing.setContent("original private content");
        when(journalRepository.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(existing));
        Journal updates = new Journal();
        updates.setTitle("New Title");
        updates.setContent(null);

        Journal result = journalService.updateJournal(1L, 10L, updates);

        assertThat(result.getContent()).isEqualTo("original private content");
        assertThat(result.getTitle()).isEqualTo("New Title");
    }

    @Test
    void updateJournal_NullTitle_KeepsExistingTitleInsteadOfCrashing() {
        // Regression guard: title is NOT NULL - a partial-update payload
        // that omits it used to null the column unconditionally, only
        // surfacing as a DataIntegrityViolationException -> 500 at flush
        // time (not testable at this layer, since flush is a JPA/DB
        // concern this Mockito test doesn't exercise) - matches the
        // skip-if-null convention already used for content/isDraft/etc.
        Journal existing = existingJournal(10L, 1L);
        existing.setTitle("Original Title");
        when(journalRepository.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(existing));
        Journal updates = new Journal();
        updates.setTitle(null);
        updates.setContent("some content");

        Journal result = journalService.updateJournal(1L, 10L, updates);

        assertThat(result.getTitle()).isEqualTo("Original Title");
    }

    @Test
    void updateJournal_NullTags_KeepsExistingTagsInsteadOfWiping() {
        // Regression guard: tags used to be set unconditionally
        // (updated.getTags() != null ? ... : new HashSet<>()), so a partial-
        // update payload that simply omitted tags (reachable via Swagger/
        // curl, not the shipped clients which always send both) silently
        // wiped every tag instead of leaving them untouched - matches the
        // skip-if-null convention already used for content/title/isDraft/etc.
        Journal existing = existingJournal(10L, 1L);
        existing.setTags(Set.of("original-tag"));
        when(journalRepository.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(existing));
        Journal updates = new Journal();
        updates.setTags(null);

        Journal result = journalService.updateJournal(1L, 10L, updates);

        assertThat(result.getTags()).containsExactly("original-tag");
    }

    @Test
    void updateJournal_NullMood_KeepsExistingMoodInsteadOfResettingToDefault() {
        // Regression guard: mood used to be set unconditionally
        // (existing.setMood(updated.getMood())), so a partial-update payload
        // that omitted mood silently reset it to Journal's field-initializer
        // default ("NEUTRAL") instead of leaving the real mood untouched.
        Journal existing = existingJournal(10L, 1L);
        existing.setMood("EXCITED");
        when(journalRepository.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(existing));
        Journal updates = new Journal();
        updates.setMood(null);

        Journal result = journalService.updateJournal(1L, 10L, updates);

        assertThat(result.getMood()).isEqualTo("EXCITED");
    }

    @Test
    void getJournalById_NotFound_ThrowsResourceNotFoundException() {
        when(journalRepository.findByIdAndUserId(99L, 1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> journalService.getJournalById(1L, 99L))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void getJournalById_DecryptsForCaller_DoesNotTriggerAnotherSave() {
        Journal existing = existingJournal(1L, 1L);
        existing.setContent("ENC(secret content)");
        existing.setContentEncrypted(true);
        when(journalRepository.findByIdAndUserId(1L, 1L)).thenReturn(Optional.of(existing));

        Journal result = journalService.getJournalById(1L, 1L);

        assertThat(result.getContent()).isEqualTo("secret content");
        verify(journalRepository, never()).save(any(Journal.class));
    }

    @Test
    void getJournalById_PreExistingPlaintextJournal_ReturnsUnchangedWithoutAttemptingDecrypt() {
        Journal existing = existingJournal(1L, 1L);
        existing.setContent("plain old content");
        existing.setContentEncrypted(false);
        when(journalRepository.findByIdAndUserId(1L, 1L)).thenReturn(Optional.of(existing));

        Journal result = journalService.getJournalById(1L, 1L);

        assertThat(result.getContent()).isEqualTo("plain old content");
        verify(journalEncryptionService, never()).decrypt(anyString());
    }

    @Test
    void getUserJournals_DelegatesToArchivedFalseFinder() {
        Pageable pageable = PageRequest.of(0, 10);
        Page<Journal> page = new PageImpl<>(List.of(existingJournal(1L, 1L)), pageable, 1);
        when(journalRepository.findByUserIdAndIsArchivedFalse(1L, pageable)).thenReturn(page);

        PagedResponse<Journal> response = journalService.getUserJournals(1L, pageable);

        assertThat(response.getContent()).hasSize(1);
        assertThat(response.getTotalElements()).isEqualTo(1);
    }

    @Test
    void togglePin_FlipsCurrentValue() {
        Journal existing = existingJournal(1L, 1L);
        existing.setIsPinned(false);
        when(journalRepository.findByIdAndUserId(1L, 1L)).thenReturn(Optional.of(existing));

        Journal result = journalService.togglePin(1L, 1L);

        assertThat(result.getIsPinned()).isTrue();
    }

    @Test
    void togglePin_EncryptedJournal_ReturnsDecryptedContentAndPersistsCiphertextUnchanged() {
        // Regression guard: togglePin must not re-fetch via the decrypting
        // getJournalById() path - if it did, the plaintext-in-memory content
        // would get saved straight back over the ciphertext column. Snapshot
        // content at save()-call-time since save() returns the same instance
        // persistAndDecrypt() mutates afterward.
        String[] contentAtSaveTime = new String[1];
        when(journalRepository.save(any(Journal.class))).thenAnswer(invocation -> {
            Journal arg = invocation.getArgument(0);
            contentAtSaveTime[0] = arg.getContent();
            return arg;
        });
        Journal existing = existingJournal(1L, 1L);
        existing.setContent("ENC(secret content)");
        existing.setContentEncrypted(true);
        existing.setIsPinned(false);
        when(journalRepository.findByIdAndUserId(1L, 1L)).thenReturn(Optional.of(existing));

        Journal result = journalService.togglePin(1L, 1L);

        assertThat(contentAtSaveTime[0]).isEqualTo("ENC(secret content)");
        assertThat(result.getIsPinned()).isTrue();
        assertThat(result.getContent()).isEqualTo("secret content");
    }

    @Test
    void toggleFavorite_FlipsCurrentValue() {
        Journal existing = existingJournal(1L, 1L);
        existing.setIsFavorite(true);
        when(journalRepository.findByIdAndUserId(1L, 1L)).thenReturn(Optional.of(existing));

        Journal result = journalService.toggleFavorite(1L, 1L);

        assertThat(result.getIsFavorite()).isFalse();
    }

    @Test
    void toggleArchive_FlipsCurrentValue() {
        Journal existing = existingJournal(1L, 1L);
        existing.setIsArchived(false);
        when(journalRepository.findByIdAndUserId(1L, 1L)).thenReturn(Optional.of(existing));

        Journal result = journalService.toggleArchive(1L, 1L);

        assertThat(result.getIsArchived()).isTrue();
    }

    @Test
    void softDeleteJournal_OwnedJournal_DeletesIt() {
        // journalRepository.delete(...) is intercepted by Journal's own
        // @SQLDelete into a soft-delete UPDATE - that's the correct mechanism
        // for a "trash" action, unlike permanentDeleteJournal below which
        // must bypass it for a real row removal.
        Journal existing = existingJournal(1L, 1L);
        when(journalRepository.findByIdAndUserId(1L, 1L)).thenReturn(Optional.of(existing));

        journalService.softDeleteJournal(1L, 1L);

        verify(journalRepository).delete(existing);
        verify(journalRepository, never()).hardDeleteByIdAndUserId(any(), any());
    }

    @Test
    void softDeleteJournal_PublishesJournalDeletedEvent() {
        // A soft-deleted (trashed) journal must stop being surfaced by
        // search too - search-service's listener removes it from the index
        // on this event.
        Journal existing = existingJournal(1L, 1L);
        when(journalRepository.findByIdAndUserId(1L, 1L)).thenReturn(Optional.of(existing));

        journalService.softDeleteJournal(1L, 1L);

        ArgumentCaptor<JournalDeletedEvent> captor = ArgumentCaptor.forClass(JournalDeletedEvent.class);
        verify(rabbitTemplate).convertAndSend(eq(JournalEventRouting.EXCHANGE_NAME), eq(JournalEventRouting.ROUTING_KEY_DELETED), captor.capture());
        assertThat(captor.getValue().getJournalId()).isEqualTo(1L);
        assertThat(captor.getValue().getUserId()).isEqualTo(1L);
    }

    @Test
    void permanentDeleteJournal_NotOwnedByCaller_ThrowsAndDoesNotDelete() {
        when(journalRepository.countByIdAndUserId(1L, 2L)).thenReturn(0L);

        assertThatThrownBy(() -> journalService.permanentDeleteJournal(2L, 1L))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(journalRepository, never()).delete(any(Journal.class));
        verify(journalRepository, never()).hardDeleteByIdAndUserId(any(), any());
        verifyNoInteractions(rabbitTemplate);
    }

    @Test
    void permanentDeleteJournal_OwnedByCaller_ReallyDeletesIt_NotJustSoftDelete() {
        // Regression guard for the specific bug this fix exists for: a plain
        // journalRepository.delete(journal) call gets silently rewritten by
        // Journal's @SQLDelete into the same soft-delete UPDATE
        // softDeleteJournal relies on - "permanent" delete must instead go
        // through the native bulk-delete method that bypasses that annotation.
        when(journalRepository.countByIdAndUserId(1L, 1L)).thenReturn(1L);

        journalService.permanentDeleteJournal(1L, 1L);

        verify(journalRepository).hardDeleteByIdAndUserId(1L, 1L);
        verify(journalRepository, never()).delete(any(Journal.class));
    }

    @Test
    void permanentDeleteJournal_AlreadyTrashedJournal_StillDeletesIt() {
        // Regression guard for the actual bug: findByIdAndUserId (used by
        // every other ownership check in this class) is subject to
        // @SQLRestriction("is_deleted = false") and would 404 a soft-deleted
        // journal - "empty trash" must be able to reach it, so the ownership
        // check here uses countByIdAndUserId (native SQL, ignores the
        // restriction) instead. findByIdAndUserId is deliberately left
        // unstubbed (would return Optional.empty() by default) to prove this
        // path never calls it.
        when(journalRepository.countByIdAndUserId(1L, 1L)).thenReturn(1L);

        journalService.permanentDeleteJournal(1L, 1L);

        verify(journalRepository).hardDeleteByIdAndUserId(1L, 1L);
        verify(journalRepository, never()).findByIdAndUserId(any(), any());
    }

    @Test
    void permanentDeleteJournal_PublishesJournalDeletedEvent() {
        when(journalRepository.countByIdAndUserId(1L, 1L)).thenReturn(1L);

        journalService.permanentDeleteJournal(1L, 1L);

        ArgumentCaptor<JournalDeletedEvent> captor = ArgumentCaptor.forClass(JournalDeletedEvent.class);
        verify(rabbitTemplate).convertAndSend(eq(JournalEventRouting.EXCHANGE_NAME), eq(JournalEventRouting.ROUTING_KEY_DELETED), captor.capture());
        assertThat(captor.getValue().getJournalId()).isEqualTo(1L);
        assertThat(captor.getValue().getUserId()).isEqualTo(1L);
    }
}
