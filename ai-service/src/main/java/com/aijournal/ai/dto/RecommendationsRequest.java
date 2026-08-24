package com.aijournal.ai.dto;

import jakarta.validation.constraints.Size;

// Both fields stay optional here (matching the existing behavior this
// replaces - a null content was already tolerated, and mood already
// defaulted to "NEUTRAL") - only the previously-unbounded content length
// is newly constrained.
public class RecommendationsRequest {

    @Size(max = 20_000, message = "content must be at most 20,000 characters")
    private String content;
    private String mood;

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getMood() { return mood; }
    public void setMood(String mood) { this.mood = mood; }
}
