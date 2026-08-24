package com.aijournal.user.dto;

// Request-only shape for PUT /api/v1/users/preferences - same reasoning as
// UserProfileRequest: keeps userId/updatedAt structurally out of the
// client-controllable request body instead of relying on
// UserServiceImpl.updatePreferences never reading them from the entity.
public class UserPreferencesRequest {

    private Boolean darkMode;
    private String timeZone;
    private String language;
    private Boolean emailNotifications;
    private Boolean pushNotifications;
    private String dailyReminderTime;

    public Boolean getDarkMode() { return darkMode; }
    public void setDarkMode(Boolean darkMode) { this.darkMode = darkMode; }
    public String getTimeZone() { return timeZone; }
    public void setTimeZone(String timeZone) { this.timeZone = timeZone; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public Boolean getEmailNotifications() { return emailNotifications; }
    public void setEmailNotifications(Boolean emailNotifications) { this.emailNotifications = emailNotifications; }
    public Boolean getPushNotifications() { return pushNotifications; }
    public void setPushNotifications(Boolean pushNotifications) { this.pushNotifications = pushNotifications; }
    public String getDailyReminderTime() { return dailyReminderTime; }
    public void setDailyReminderTime(String dailyReminderTime) { this.dailyReminderTime = dailyReminderTime; }
}
