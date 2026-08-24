package com.aijournal.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// Shared request shape for the 5 endpoints that only ever take one
// "content" field (summarize/mood/tags/rephrase/grammar) - previously each
// took a raw Map<String,String> with no schema, no @NotBlank, no @Size, so
// a blank/missing content silently reached the service layer (and from
// there, python-ai-service) instead of failing with a clean 400 at the
// boundary that actually receives the client's JSON.
public class ContentRequest {

    @NotBlank(message = "content is required")
    @Size(max = 20_000, message = "content must be at most 20,000 characters")
    private String content;

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}
