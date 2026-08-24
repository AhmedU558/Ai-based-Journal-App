package com.aijournal.notification.controller;

import com.aijournal.common.dto.ApiResponse;
import com.aijournal.common.dto.PagedResponse;
import com.aijournal.notification.dto.CreateNotificationRequest;
import com.aijournal.notification.dto.NotificationResponse;
import com.aijournal.notification.dto.RegisterDeviceTokenRequest;
import com.aijournal.notification.dto.SendEmailRequest;
import com.aijournal.notification.service.NotificationService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/notifications")
@Tag(name = "Notification API", description = "Email & Push Notifications Pipeline, plus a real in-app notification log")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    // ROLE_SYSTEM-only: this sends real email from the platform's own
    // address, so it must never be reachable with a normal user's JWT - both
    // real callers (auth-service's welcome/password-reset emails) already
    // authenticate via a short-lived internal system token, not the caller's
    // own credentials, so this restriction breaks nothing legitimate.
    @PostMapping("/send-email")
    @PreAuthorize("hasRole('SYSTEM')")
    @Operation(summary = "Send an email notification (internal, ROLE_SYSTEM only)")
    public ResponseEntity<ApiResponse<Void>> sendEmail(@Valid @RequestBody SendEmailRequest request) {
        notificationService.sendEmail(request.getTo(), request.getSubject(), request.getBody());
        return ResponseEntity.ok(ApiResponse.success("Email sent successfully", null));
    }

    // Same restriction and reasoning as /send-email above - only other
    // services (auth-service, on real account-security events) create
    // notifications on a user's behalf.
    @PostMapping
    @PreAuthorize("hasRole('SYSTEM')")
    @Operation(summary = "Create a notification for a user (internal, ROLE_SYSTEM only)")
    public ResponseEntity<ApiResponse<Void>> createNotification(@Valid @RequestBody CreateNotificationRequest request) {
        notificationService.createNotification(request.getUserId(), request.getType(), request.getMessage());
        return ResponseEntity.ok(ApiResponse.success("Notification created", null));
    }

    @GetMapping
    @Operation(summary = "List the authenticated user's own notifications, newest first")
    public ResponseEntity<ApiResponse<PagedResponse<NotificationResponse>>> listNotifications(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return ResponseEntity.ok(ApiResponse.success(notificationService.listNotifications(userId, pageable)));
    }

    @PutMapping("/read-all")
    @Operation(summary = "Mark all of the authenticated user's notifications as read")
    public ResponseEntity<ApiResponse<Void>> markAllAsRead(@RequestHeader("X-User-Id") Long userId) {
        notificationService.markAllAsRead(userId);
        return ResponseEntity.ok(ApiResponse.success("All notifications marked as read", null));
    }

    @PostMapping("/reminder")
    @Operation(summary = "Trigger daily journal reminder for user")
    public ResponseEntity<ApiResponse<Void>> triggerReminder(@RequestHeader("X-User-Id") Long userId) {
        notificationService.sendDailyJournalReminder(userId);
        return ResponseEntity.ok(ApiResponse.success("Daily reminder sent successfully", null));
    }

    @PostMapping("/device-token")
    @Operation(summary = "Register (or refresh) a device's Expo push token for the authenticated user")
    public ResponseEntity<ApiResponse<Void>> registerDeviceToken(
            @RequestHeader("X-User-Id") Long userId,
            @Valid @RequestBody RegisterDeviceTokenRequest request) {
        notificationService.registerDeviceToken(userId, request.getExpoPushToken(), request.getPlatform());
        return ResponseEntity.ok(ApiResponse.success("Device token registered", null));
    }

    @DeleteMapping("/device-token")
    @Operation(summary = "Unregister a device's Expo push token, e.g. on logout")
    public ResponseEntity<ApiResponse<Void>> unregisterDeviceToken(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam("expoPushToken") String expoPushToken) {
        notificationService.unregisterDeviceToken(userId, expoPushToken);
        return ResponseEntity.ok(ApiResponse.success("Device token unregistered", null));
    }
}
