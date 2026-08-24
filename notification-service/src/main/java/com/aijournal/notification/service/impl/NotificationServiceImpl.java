package com.aijournal.notification.service.impl;

import com.aijournal.common.dto.PagedResponse;
import com.aijournal.notification.dto.NotificationResponse;
import com.aijournal.notification.entity.DeviceToken;
import com.aijournal.notification.entity.Notification;
import com.aijournal.notification.repository.DeviceTokenRepository;
import com.aijournal.notification.repository.NotificationRepository;
import com.aijournal.notification.service.ExpoPushService;
import com.aijournal.notification.service.NotificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class NotificationServiceImpl implements NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationServiceImpl.class);

    private final DeviceTokenRepository deviceTokenRepository;
    private final NotificationRepository notificationRepository;
    private final ExpoPushService expoPushService;
    private final JavaMailSender mailSender;

    @Value("${notification.mail.from:noreply@mindora.local}")
    private String fromAddress;

    public NotificationServiceImpl(DeviceTokenRepository deviceTokenRepository, NotificationRepository notificationRepository,
                                    ExpoPushService expoPushService, JavaMailSender mailSender) {
        this.deviceTokenRepository = deviceTokenRepository;
        this.notificationRepository = notificationRepository;
        this.expoPushService = expoPushService;
        this.mailSender = mailSender;
    }

    // Runs off the calling (servlet request) thread - mailSender.send() is a
    // real synchronous SMTP round trip, and previously blocked whichever
    // thread called this for however long that took. This is called through
    // Spring's proxy from a different bean (NotificationController), so
    // @Async's AOP interception applies correctly here - unlike the private
    // same-class calls this exact self-invocation pitfall bit elsewhere in
    // this codebase (see AuthServiceImpl's own notificationExecutor comment).
    @Override
    @Async("mailExecutor")
    public void sendEmail(String to, String subject, String body) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromAddress);
            message.setTo(to);
            message.setSubject(subject);
            message.setText(body);
            mailSender.send(message);
            log.info("Sent email to {}: '{}'", to, subject);
        } catch (Exception e) {
            log.warn("Failed to send email to {}: {}", to, e.getMessage());
        }
    }

    @Override
    public void sendPushNotification(Long userId, String title, String message) {
        List<String> tokens = deviceTokenRepository.findByUserId(userId).stream()
                .map(DeviceToken::getExpoPushToken)
                .toList();
        if (tokens.isEmpty()) {
            log.info("No registered device token for user {} - skipping push \"{}\"", userId, title);
            return;
        }
        expoPushService.sendPush(tokens, title, message);
    }

    @Override
    public void sendDailyJournalReminder(Long userId) {
        sendPushNotification(userId, "Daily Reminder", "Don't forget to reflect on your day and write your journal entry!");
    }

    @Override
    @Transactional
    public void registerDeviceToken(Long userId, String expoPushToken, String platform) {
        Optional<DeviceToken> existing = deviceTokenRepository.findByUserIdAndExpoPushToken(userId, expoPushToken);
        DeviceToken token = existing.orElseGet(() -> new DeviceToken(userId, expoPushToken, platform));
        token.setPlatform(platform);
        deviceTokenRepository.save(token);
    }

    @Override
    @Transactional
    public void unregisterDeviceToken(Long userId, String expoPushToken) {
        deviceTokenRepository.deleteByUserIdAndExpoPushToken(userId, expoPushToken);
    }

    @Override
    @Transactional
    public void createNotification(Long userId, String type, String message) {
        notificationRepository.save(new Notification(userId, type, message));
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<NotificationResponse> listNotifications(Long userId, Pageable pageable) {
        Page<Notification> page = notificationRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable);
        List<NotificationResponse> content = page.getContent().stream()
                .map(n -> new NotificationResponse(n.getId(), n.getType(), n.getMessage(),
                        Boolean.TRUE.equals(n.getRead()), n.getCreatedAt()))
                .toList();
        return new PagedResponse<>(content, page.getNumber(), page.getSize(), page.getTotalElements(),
                page.getTotalPages(), page.isLast(), page.isFirst());
    }

    @Override
    @Transactional
    public void markAllAsRead(Long userId) {
        notificationRepository.markAllAsReadForUser(userId);
    }
}
