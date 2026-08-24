package com.aijournal.journal.service.impl;

import com.aijournal.common.dto.PagedResponse;
import com.aijournal.common.event.JournalCreatedEvent;
import com.aijournal.common.event.JournalDeletedEvent;
import com.aijournal.common.event.JournalUpdatedEvent;
import com.aijournal.common.exception.ResourceNotFoundException;
import com.aijournal.common.messaging.JournalEventRouting;
import com.aijournal.journal.entity.Journal;
import com.aijournal.journal.repository.JournalRepository;
import com.aijournal.journal.service.JournalEncryptionService;
import com.aijournal.journal.service.JournalService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

@Service
public class JournalServiceImpl implements JournalService {

    private final JournalRepository journalRepository;
    private final RabbitTemplate rabbitTemplate;
    private final JournalEncryptionService journalEncryptionService;

    @PersistenceContext
    private EntityManager entityManager;

    public JournalServiceImpl(JournalRepository journalRepository, RabbitTemplate rabbitTemplate,
                               JournalEncryptionService journalEncryptionService) {
        this.journalRepository = journalRepository;
        this.rabbitTemplate = rabbitTemplate;
        this.journalEncryptionService = journalEncryptionService;
    }

    @Override
    @Transactional
    public Journal createJournal(Long userId, Journal journal) {
        // A create request body is client-controlled JSON deserialized straight
        // onto the entity - id/version have plain public setters with no
        // @JsonIgnore, so a client sending {"id": <someone else's journalId>,
        // "version": 0} would make Hibernate's default isNew() check (which is
        // version-based once @Version is present) treat this as NOT new and
        // call merge() instead of persist(), overwriting another user's
        // existing row (including reassigning its userId to the attacker).
        // Force both to null so every create is unambiguously a real insert.
        journal.setId(null);
        journal.setVersion(null);
        journal.setUserId(userId);
        if (journal.getTitle() == null || journal.getTitle().isBlank()) {
            journal.setTitle("Untitled Journal Entry");
        }
        if (journal.getContent() == null) {
            journal.setContent("");
        }
        if (journal.getMood() == null) {
            journal.setMood("HAPPY");
        }
        if (journal.getTags() == null) {
            journal.setTags(new HashSet<>());
        }
        if (journal.getIsDraft() == null) journal.setIsDraft(false);
        if (journal.getIsPinned() == null) journal.setIsPinned(false);
        if (journal.getIsFavorite() == null) journal.setIsFavorite(false);
        if (journal.getIsArchived() == null) journal.setIsArchived(false);
        // Compute word/char/reading-time metrics from the real plaintext
        // before encrypting - calculateMetrics() is a no-op once
        // contentEncrypted is true, so this must happen first or the
        // lifecycle-triggered recompute at flush time would silently skip it.
        journal.calculateMetrics();
        journal.setContent(journalEncryptionService.encrypt(journal.getContent()));
        journal.setContentEncrypted(true);

        Journal saved = persistAndDecrypt(journalRepository.save(journal));

        // Async event dispatch to RabbitMQ for AI Service & Search Service.
        // Built from `saved` AFTER persistAndDecrypt(), so the event (and the
        // Elasticsearch index it feeds) carries real plaintext, not ciphertext.
        try {
            JournalCreatedEvent event = new JournalCreatedEvent(
                    saved.getId(),
                    saved.getUserId(),
                    saved.getTitle(),
                    saved.getContent(),
                    saved.getMood(),
                    new ArrayList<>(saved.getTags()),
                    saved.getLocation(),
                    saved.getWeather(),
                    LocalDateTime.now()
            );
            rabbitTemplate.convertAndSend(JournalEventRouting.EXCHANGE_NAME, JournalEventRouting.ROUTING_KEY_CREATED, event);
        } catch (Exception e) {
            // Log fallback if RabbitMQ broker is offline
        }

        return saved;
    }

    @Override
    @Transactional
    public Journal updateJournal(Long userId, Long journalId, Journal updated) {
        Journal existing = findOwnedJournal(userId, journalId);
        // title is NOT NULL - a partial-update payload that omits it must leave
        // the existing title untouched rather than null the column at flush time,
        // matching the skip-if-null convention already used below for
        // isDraft/folderId/categoryId.
        if (updated.getTitle() != null) {
            existing.setTitle(updated.getTitle());
        }
        // A partial-update payload that omits content entirely (updated.getContent()
        // == null) must leave the existing content untouched rather than crash -
        // journalEncryptionService.encrypt(null) would NPE. Matches the
        // skip-if-null convention already used below for isDraft/folderId/categoryId.
        if (updated.getContent() != null) {
            // existing.contentEncrypted may already be true from a prior save -
            // force it false while the field briefly holds real plaintext so
            // calculateMetrics() actually recomputes instead of no-op'ing.
            existing.setContentEncrypted(false);
            existing.setContent(updated.getContent());
            existing.calculateMetrics();
            existing.setContent(journalEncryptionService.encrypt(updated.getContent()));
            existing.setContentEncrypted(true);
        }
        // mood/tags now skip-if-null like every sibling field here - a PUT that
        // omits them (e.g. Swagger/curl, not the shipped clients which always
        // send both) must leave them unchanged instead of silently resetting
        // mood to Journal's field-initializer default and wiping every tag.
        if (updated.getMood() != null) existing.setMood(updated.getMood());
        if (updated.getLocation() != null) existing.setLocation(updated.getLocation());
        if (updated.getWeather() != null) existing.setWeather(updated.getWeather());
        if (updated.getTags() != null) existing.setTags(updated.getTags());
        if (updated.getIsDraft() != null) existing.setIsDraft(updated.getIsDraft());
        if (updated.getFolderId() != null) existing.setFolderId(updated.getFolderId());
        if (updated.getCategoryId() != null) existing.setCategoryId(updated.getCategoryId());

        Journal saved = persistAndDecrypt(journalRepository.save(existing));

        try {
            JournalUpdatedEvent event = new JournalUpdatedEvent(
                    saved.getId(),
                    saved.getUserId(),
                    saved.getTitle(),
                    saved.getContent(),
                    saved.getMood(),
                    new ArrayList<>(saved.getTags()),
                    LocalDateTime.now()
            );
            rabbitTemplate.convertAndSend(JournalEventRouting.EXCHANGE_NAME, JournalEventRouting.ROUTING_KEY_UPDATED, event);
        } catch (Exception e) {
            // Log fallback
        }

        return saved;
    }

    @Override
    @Transactional(readOnly = true)
    public Journal getJournalById(Long userId, Long journalId) {
        return decryptForRead(findOwnedJournal(userId, journalId));
    }

    // Raw fetch, content left exactly as stored (ciphertext for encrypted rows).
    // Used by every internal mutation path so a subsequent save() never risks
    // persisting the decrypted-for-display content back over the ciphertext -
    // only getJournalById()/list reads route through decryptForRead().
    private Journal findOwnedJournal(Long userId, Long journalId) {
        return journalRepository.findByIdAndUserId(journalId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Journal", "id", journalId));
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<Journal> getUserJournals(Long userId, Pageable pageable) {
        Page<Journal> page = journalRepository.findByUserIdAndIsArchivedFalse(userId, pageable);
        return toPagedResponse(page);
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<Journal> getPinnedJournals(Long userId, Pageable pageable) {
        Page<Journal> page = journalRepository.findByUserIdAndIsPinnedTrue(userId, pageable);
        return toPagedResponse(page);
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<Journal> getFavoriteJournals(Long userId, Pageable pageable) {
        Page<Journal> page = journalRepository.findByUserIdAndIsFavoriteTrue(userId, pageable);
        return toPagedResponse(page);
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<Journal> getArchivedJournals(Long userId, Pageable pageable) {
        Page<Journal> page = journalRepository.findByUserIdAndIsArchivedTrue(userId, pageable);
        return toPagedResponse(page);
    }

    @Override
    @Transactional
    public Journal togglePin(Long userId, Long journalId) {
        Journal journal = findOwnedJournal(userId, journalId);
        journal.setIsPinned(!journal.getIsPinned());
        return persistAndDecrypt(journalRepository.save(journal));
    }

    @Override
    @Transactional
    public Journal toggleFavorite(Long userId, Long journalId) {
        Journal journal = findOwnedJournal(userId, journalId);
        journal.setIsFavorite(!journal.getIsFavorite());
        return persistAndDecrypt(journalRepository.save(journal));
    }

    @Override
    @Transactional
    public Journal toggleArchive(Long userId, Long journalId) {
        Journal journal = findOwnedJournal(userId, journalId);
        journal.setIsArchived(!journal.getIsArchived());
        return persistAndDecrypt(journalRepository.save(journal));
    }

    @Override
    @Transactional
    public void softDeleteJournal(Long userId, Long journalId) {
        Journal journal = findOwnedJournal(userId, journalId);
        // Journal's @SQLDelete intercepts this into an UPDATE ... is_deleted =
        // true, not a real row removal - which is exactly right for a "trash"
        // action. @SQLRestriction("is_deleted = false") already hides it from
        // every subsequent journal-service read, so it should stop being
        // surfaced by search too - see the publishJournalDeletedEvent() call
        // below.
        journalRepository.delete(journal);
        publishJournalDeletedEvent(journalId, userId);
    }

    @Override
    @Transactional
    public void permanentDeleteJournal(Long userId, Long journalId) {
        // Ownership check via a native COUNT, not findOwnedJournal() -
        // findOwnedJournal goes through @SQLRestriction("is_deleted = false")
        // and would 404 exactly the journals this method needs to reach
        // (a journal must normally be trashed via softDeleteJournal first,
        // before "empty trash"/permanent-delete can remove it for good).
        if (journalRepository.countByIdAndUserId(journalId, userId) == 0) {
            throw new ResourceNotFoundException("Journal", "id", journalId);
        }
        // A plain journalRepository.delete(journal) would hit the exact same
        // @SQLDelete interception softDeleteJournal relies on, silently
        // turning "permanent" delete into the same soft-delete UPDATE - this
        // native delete bypasses that annotation entirely for a real row
        // removal (see JournalRepository.hardDeleteByIdAndUserId's comment).
        journalRepository.hardDeleteByIdAndUserId(journalId, userId);
        publishJournalDeletedEvent(journalId, userId);
    }

    @Override
    @Transactional
    public void deleteAllJournalsForUser(Long userId) {
        List<Long> ids = journalRepository.findIdsByUserId(userId);
        journalRepository.hardDeleteAllByUserId(userId);
        for (Long id : ids) {
            publishJournalDeletedEvent(id, userId);
        }
    }

    private void publishJournalDeletedEvent(Long journalId, Long userId) {
        try {
            JournalDeletedEvent event = new JournalDeletedEvent(journalId, userId);
            rabbitTemplate.convertAndSend(JournalEventRouting.EXCHANGE_NAME, JournalEventRouting.ROUTING_KEY_DELETED, event);
        } catch (Exception e) {
            // Log fallback if RabbitMQ broker is offline
        }
    }

    private PagedResponse<Journal> toPagedResponse(Page<Journal> page) {
        page.getContent().forEach(this::decryptForRead);
        return new PagedResponse<>(
                page.getContent(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages(),
                page.isLast(),
                page.isFirst()
        );
    }

    // Write paths (create/update/toggle): the entity was just save()'d in the
    // current transaction, so its pending change must be flushed to the DB
    // *before* detaching - otherwise the encrypted content set on the entity
    // earlier in the method would still be sitting unflushed in the
    // persistence context, and detaching would just discard it.
    private Journal persistAndDecrypt(Journal managed) {
        entityManager.flush();
        entityManager.detach(managed);
        if (Boolean.TRUE.equals(managed.getContentEncrypted())) {
            managed.setContent(journalEncryptionService.decrypt(managed.getContent()));
        }
        return managed;
    }

    // Read paths: nothing was written this transaction, so no flush is
    // needed - but still detach before mutating, so correctness doesn't
    // depend on readOnly=true's FlushMode.MANUAL behavior.
    private Journal decryptForRead(Journal managed) {
        entityManager.detach(managed);
        if (Boolean.TRUE.equals(managed.getContentEncrypted())) {
            managed.setContent(journalEncryptionService.decrypt(managed.getContent()));
        }
        return managed;
    }
}
