package com.aijournal.user.service.impl;
import com.aijournal.common.http.RestTemplateFactory;

import com.aijournal.user.entity.UserPreferences;
import com.aijournal.user.entity.UserProfile;
import com.aijournal.user.repository.UserPreferencesRepository;
import com.aijournal.user.repository.UserProfileRepository;
import com.aijournal.user.service.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

@Service
public class UserServiceImpl implements UserService {

    private static final Logger log = LoggerFactory.getLogger(UserServiceImpl.class);

    private final UserProfileRepository userProfileRepository;
    private final UserPreferencesRepository userPreferencesRepository;
    private final RestTemplate restTemplate = RestTemplateFactory.create();

    @Value("${auth.service.url:http://auth-service:8081}")
    private String authServiceUrl;
    @Value("${journal.service.url:http://journal-service:8083}")
    private String journalServiceUrl;
    @Value("${file.service.url:http://file-service:8089}")
    private String fileServiceUrl;

    public UserServiceImpl(UserProfileRepository userProfileRepository, UserPreferencesRepository userPreferencesRepository) {
        this.userProfileRepository = userProfileRepository;
        this.userPreferencesRepository = userPreferencesRepository;
    }

    // Not readOnly - despite the name, this is a get-or-create (the
    // orElseGet branch calls save()). A readOnly transaction can be routed
    // to a read replica or a connection pool that strictly enforces
    // read-only mode, where that save() would throw
    // "Connection is read-only. Queries leading to data modification are
    // not allowed" instead of lazily creating the row.
    @Override
    @Transactional
    public UserProfile getProfile(Long userId) {
        return userProfileRepository.findById(userId)
                .orElseGet(() -> userProfileRepository.save(new UserProfile(userId, "", "", "", "", "")));
    }

    @Override
    @Transactional
    public UserProfile updateProfile(Long userId, UserProfile updated) {
        UserProfile existing = getProfile(userId);
        existing.setBio(updated.getBio());
        existing.setAvatarUrl(updated.getAvatarUrl());
        existing.setPhoneNumber(updated.getPhoneNumber());
        existing.setCountry(updated.getCountry());
        existing.setCity(updated.getCity());
        return userProfileRepository.save(existing);
    }

    // Same reasoning as getProfile() above - a get-or-create must not be
    // marked readOnly.
    @Override
    @Transactional
    public UserPreferences getPreferences(Long userId) {
        return userPreferencesRepository.findById(userId)
                .orElseGet(() -> userPreferencesRepository.save(new UserPreferences(userId, true, "UTC", "en", true, true, "20:00")));
    }

    @Override
    @Transactional
    public UserPreferences updatePreferences(Long userId, UserPreferences updated) {
        // Skip-if-null, unlike updateProfile above which always sends the
        // full shape - a partial PUT (e.g. just {"darkMode": false}, the only
        // shape any real caller sends today) must not null out the other
        // NOT NULL columns (darkMode/timeZone/language/emailNotifications/
        // pushNotifications) it omitted.
        UserPreferences existing = getPreferences(userId);
        if (updated.getDarkMode() != null) existing.setDarkMode(updated.getDarkMode());
        if (updated.getTimeZone() != null) existing.setTimeZone(updated.getTimeZone());
        if (updated.getLanguage() != null) existing.setLanguage(updated.getLanguage());
        if (updated.getEmailNotifications() != null) existing.setEmailNotifications(updated.getEmailNotifications());
        if (updated.getPushNotifications() != null) existing.setPushNotifications(updated.getPushNotifications());
        if (updated.getDailyReminderTime() != null) existing.setDailyReminderTime(updated.getDailyReminderTime());
        return userPreferencesRepository.save(existing);
    }

    @Override
    @Transactional
    public void deleteUserAccount(Long userId, String authorizationHeader) {
        // auth-service's delete is the one call that MUST succeed - it's
        // what actually revokes the ability to log in again, the real
        // meaning of "delete my account." If it fails, the whole operation
        // aborts (profile/preferences are left untouched) so the caller can
        // retry rather than ending up in a half-deleted state where their
        // login still works but their profile is gone.
        callInternalDelete(authServiceUrl + "/api/v1/auth/account", userId, authorizationHeader, "auth-service");

        // Both rows are created lazily (get-or-create in getProfile/getPreferences
        // above) - a user who requests deletion without ever having viewed
        // either would make deleteById throw EmptyResultDataAccessException.
        if (userProfileRepository.existsById(userId)) {
            userProfileRepository.deleteById(userId);
        }
        if (userPreferencesRepository.existsById(userId)) {
            userPreferencesRepository.deleteById(userId);
        }

        // journal-service and file-service cleanup is best-effort, not
        // fatal - by this point the account's login credentials are already
        // gone (the guarantee the user actually cares about), so a
        // downstream service being briefly unreachable means leftover data
        // to clean up later, not a broken "my account still exists" state.
        try {
            callInternalDelete(journalServiceUrl + "/api/v1/journals/all", userId, authorizationHeader, "journal-service");
        } catch (Exception e) {
            log.warn("Failed to delete journals for deleted account userId={}: {}", userId, e.getMessage());
        }
        try {
            callInternalDelete(fileServiceUrl + "/api/v1/files/all", userId, authorizationHeader, "file-service");
        } catch (Exception e) {
            log.warn("Failed to delete files for deleted account userId={}: {}", userId, e.getMessage());
        }
    }

    private void callInternalDelete(String url, Long userId, String authorizationHeader, String targetServiceName) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-User-Id", String.valueOf(userId));
        if (authorizationHeader != null) {
            headers.set(HttpHeaders.AUTHORIZATION, authorizationHeader);
        }
        try {
            restTemplate.exchange(url, HttpMethod.DELETE, new HttpEntity<>(headers), Void.class);
        } catch (Exception e) {
            throw new IllegalStateException("Call to " + targetServiceName + " failed during account deletion", e);
        }
    }
}
