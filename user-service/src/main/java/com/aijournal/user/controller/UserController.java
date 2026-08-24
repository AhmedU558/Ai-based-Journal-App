package com.aijournal.user.controller;

import com.aijournal.common.dto.ApiResponse;
import com.aijournal.user.dto.UserPreferencesRequest;
import com.aijournal.user.dto.UserProfileRequest;
import com.aijournal.user.entity.UserPreferences;
import com.aijournal.user.entity.UserProfile;
import com.aijournal.user.service.UserService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/users")
@Tag(name = "User Profile & Preferences API", description = "Manage user profiles, theme/dark mode preferences, timezones, and GDPR account deletion")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/profile")
    @Operation(summary = "Get user profile")
    public ResponseEntity<ApiResponse<UserProfile>> getProfile(@RequestHeader("X-User-Id") Long userId) {
        UserProfile profile = userService.getProfile(userId);
        return ResponseEntity.ok(ApiResponse.success(profile));
    }

    @PutMapping("/profile")
    @Operation(summary = "Update user profile")
    public ResponseEntity<ApiResponse<UserProfile>> updateProfile(
            @RequestHeader("X-User-Id") Long userId,
            @RequestBody UserProfileRequest request) {
        UserProfile profile = new UserProfile();
        profile.setBio(request.getBio());
        profile.setAvatarUrl(request.getAvatarUrl());
        profile.setPhoneNumber(request.getPhoneNumber());
        profile.setCountry(request.getCountry());
        profile.setCity(request.getCity());
        UserProfile updated = userService.updateProfile(userId, profile);
        return ResponseEntity.ok(ApiResponse.success("Profile updated successfully", updated));
    }

    @GetMapping("/preferences")
    @Operation(summary = "Get user settings & dark mode preference")
    public ResponseEntity<ApiResponse<UserPreferences>> getPreferences(@RequestHeader("X-User-Id") Long userId) {
        UserPreferences preferences = userService.getPreferences(userId);
        return ResponseEntity.ok(ApiResponse.success(preferences));
    }

    @PutMapping("/preferences")
    @Operation(summary = "Update user settings (Dark Mode, Language, Timezone)")
    public ResponseEntity<ApiResponse<UserPreferences>> updatePreferences(
            @RequestHeader("X-User-Id") Long userId,
            @RequestBody UserPreferencesRequest request) {
        UserPreferences preferences = new UserPreferences();
        preferences.setDarkMode(request.getDarkMode());
        preferences.setTimeZone(request.getTimeZone());
        preferences.setLanguage(request.getLanguage());
        preferences.setEmailNotifications(request.getEmailNotifications());
        preferences.setPushNotifications(request.getPushNotifications());
        preferences.setDailyReminderTime(request.getDailyReminderTime());
        UserPreferences updated = userService.updatePreferences(userId, preferences);
        return ResponseEntity.ok(ApiResponse.success("Preferences updated successfully", updated));
    }

    @DeleteMapping("/account")
    @Operation(summary = "GDPR Account Deletion")
    public ResponseEntity<ApiResponse<Void>> deleteAccount(
            @RequestHeader("X-User-Id") Long userId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        userService.deleteUserAccount(userId, authorizationHeader);
        return ResponseEntity.ok(ApiResponse.success("Account and user data deleted successfully", null));
    }
}
