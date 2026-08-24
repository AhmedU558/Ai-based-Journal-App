package com.aijournal.user.controller;

import com.aijournal.user.dto.UserPreferencesRequest;
import com.aijournal.user.dto.UserProfileRequest;
import com.aijournal.user.entity.UserPreferences;
import com.aijournal.user.entity.UserProfile;
import com.aijournal.user.service.UserService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserControllerTest {

    @Mock
    private UserService userService;

    private UserController controller() {
        return new UserController(userService);
    }

    @Test
    void updateProfile_MapsRequestFieldsOntoEntity() {
        UserController controller = controller();
        UserProfileRequest request = new UserProfileRequest();
        request.setBio("New bio");
        request.setAvatarUrl("user-5/avatar.jpg");
        request.setPhoneNumber("555-1234");
        request.setCountry("US");
        request.setCity("Austin");
        when(userService.updateProfile(eq(5L), org.mockito.ArgumentMatchers.any(UserProfile.class)))
                .thenReturn(new UserProfile());

        controller.updateProfile(5L, request);

        ArgumentCaptor<UserProfile> captor = ArgumentCaptor.forClass(UserProfile.class);
        verify(userService).updateProfile(eq(5L), captor.capture());
        assertThat(captor.getValue().getBio()).isEqualTo("New bio");
        assertThat(captor.getValue().getAvatarUrl()).isEqualTo("user-5/avatar.jpg");
        assertThat(captor.getValue().getPhoneNumber()).isEqualTo("555-1234");
        assertThat(captor.getValue().getCountry()).isEqualTo("US");
        assertThat(captor.getValue().getCity()).isEqualTo("Austin");
    }

    @Test
    void updateProfile_RequestHasNoUserIdOrTimestampFields() {
        // Regression guard for the over-posting fix: UserProfileRequest has
        // no setter for userId (the @Id/primary key) or createdAt/updatedAt.
        assertThat(UserProfileRequest.class.getDeclaredMethods())
                .noneMatch(m -> m.getName().equals("setUserId"))
                .noneMatch(m -> m.getName().equals("setCreatedAt"))
                .noneMatch(m -> m.getName().equals("setUpdatedAt"));
    }

    @Test
    void updatePreferences_MapsRequestFieldsOntoEntity() {
        UserController controller = controller();
        UserPreferencesRequest request = new UserPreferencesRequest();
        request.setDarkMode(true);
        request.setTimeZone("America/Chicago");
        when(userService.updatePreferences(eq(5L), org.mockito.ArgumentMatchers.any(UserPreferences.class)))
                .thenReturn(new UserPreferences());

        controller.updatePreferences(5L, request);

        ArgumentCaptor<UserPreferences> captor = ArgumentCaptor.forClass(UserPreferences.class);
        verify(userService).updatePreferences(eq(5L), captor.capture());
        assertThat(captor.getValue().getDarkMode()).isTrue();
        assertThat(captor.getValue().getTimeZone()).isEqualTo("America/Chicago");
    }

    @Test
    void updatePreferences_RequestHasNoUserIdField() {
        assertThat(UserPreferencesRequest.class.getDeclaredMethods())
                .noneMatch(m -> m.getName().equals("setUserId"));
    }
}
