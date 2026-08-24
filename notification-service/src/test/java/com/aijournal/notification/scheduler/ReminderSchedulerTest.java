package com.aijournal.notification.scheduler;

import com.aijournal.notification.repository.DeviceTokenRepository;
import com.aijournal.notification.service.NotificationService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.domain.SliceImpl;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReminderSchedulerTest {

    @Mock
    private DeviceTokenRepository deviceTokenRepository;

    @Mock
    private NotificationService notificationService;

    private ReminderScheduler scheduler() {
        return new ReminderScheduler(deviceTokenRepository, notificationService);
    }

    @Test
    void sendDailyReminders_SinglePage_NotifiesEveryUserExactlyOnce() {
        Slice<Long> singlePage = new PageImpl<>(List.of(1L, 2L, 3L), PageRequest.of(0, 500), 3);
        when(deviceTokenRepository.findDistinctUserIds(any(Pageable.class))).thenReturn(singlePage);

        scheduler().sendDailyReminders();

        verify(notificationService).sendDailyJournalReminder(1L);
        verify(notificationService).sendDailyJournalReminder(2L);
        verify(notificationService).sendDailyJournalReminder(3L);
        verify(notificationService, times(3)).sendDailyJournalReminder(any());
    }

    @Test
    void sendDailyReminders_MultiplePages_WalksEveryPageNotJustTheFirst() {
        // Regression guard for the fix: this whole finding exists because
        // the previous implementation called findAll() (one unbounded
        // query) instead of paging - a scheduler that only reads the first
        // page would silently miss every user beyond it.
        Slice<Long> page0 = new SliceImpl<>(List.of(1L, 2L), PageRequest.of(0, 500), true);
        Slice<Long> page1 = new SliceImpl<>(List.of(3L), PageRequest.of(1, 500), false);
        when(deviceTokenRepository.findDistinctUserIds(any(Pageable.class)))
                .thenReturn(page0, page1);

        scheduler().sendDailyReminders();

        ArgumentCaptor<Long> captor = ArgumentCaptor.forClass(Long.class);
        verify(notificationService, times(3)).sendDailyJournalReminder(captor.capture());
        assertThat(captor.getAllValues()).containsExactlyInAnyOrder(1L, 2L, 3L);
    }

    @Test
    void sendDailyReminders_NoRegisteredDevices_SendsNothing() {
        Slice<Long> empty = new SliceImpl<>(List.of(), PageRequest.of(0, 500), false);
        when(deviceTokenRepository.findDistinctUserIds(any(Pageable.class))).thenReturn(empty);

        scheduler().sendDailyReminders();

        verify(notificationService, times(0)).sendDailyJournalReminder(any());
    }
}
