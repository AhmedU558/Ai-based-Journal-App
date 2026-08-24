package com.aijournal.journal.dto;

import java.util.Set;

// Request-only shape for POST/PUT /api/v1/journals - the controller used to
// deserialize the client's JSON straight onto the Journal JPA entity, which
// meant every entity field (id, version, userId, contentEncrypted,
// wordCount/characterCount/readingTimeMinutes, createdAt/updatedAt,
// isDeleted/deletedAt) was a real, Jackson-deserializable target for a
// client that included it in the request body - most of the genuinely
// dangerous ones (id/version/userId/contentEncrypted) were already
// defended against with explicit resets in JournalServiceImpl, but that
// relies on every future call site remembering to keep doing so. This DTO
// makes the unsettable fields structurally impossible to set instead,
// independent of the service layer's own defenses.
public class JournalRequest {

    private String title;
    private String content;
    private String mood;
    private Set<String> tags;
    private String location;
    private String weather;
    private Boolean isDraft;
    private Long folderId;
    private Long categoryId;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getMood() { return mood; }
    public void setMood(String mood) { this.mood = mood; }
    public Set<String> getTags() { return tags; }
    public void setTags(Set<String> tags) { this.tags = tags; }
    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }
    public String getWeather() { return weather; }
    public void setWeather(String weather) { this.weather = weather; }
    public Boolean getIsDraft() { return isDraft; }
    public void setIsDraft(Boolean isDraft) { this.isDraft = isDraft; }
    public Long getFolderId() { return folderId; }
    public void setFolderId(Long folderId) { this.folderId = folderId; }
    public Long getCategoryId() { return categoryId; }
    public void setCategoryId(Long categoryId) { this.categoryId = categoryId; }
}
