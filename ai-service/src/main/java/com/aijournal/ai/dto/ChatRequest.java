package com.aijournal.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

// Replaces the previous raw Map<String,Object> body (which needed an
// @SuppressWarnings("unchecked") unchecked cast just to read "history" out
// of it) - query is now enforced at the boundary instead of silently
// forwarding a null/blank query into chatWithJournal(). history's shape
// (List<Map<String,String>> of {role, content} turns) is left as-is rather
// than introducing a further nested DTO - AiServiceImpl/FlaskAiStrategy
// already consume exactly that shape, and this is the one field genuinely
// fine staying loosely typed since it's just passed through to the
// downstream LLM prompt builder.
public class ChatRequest {

    @NotBlank(message = "query is required")
    @Size(max = 20_000, message = "query must be at most 20,000 characters")
    private String query;

    @Size(max = 20_000, message = "context must be at most 20,000 characters")
    private String context;

    private List<Map<String, String>> history;

    public String getQuery() { return query; }
    public void setQuery(String query) { this.query = query; }
    public String getContext() { return context; }
    public void setContext(String context) { this.context = context; }
    public List<Map<String, String>> getHistory() { return history; }
    public void setHistory(List<Map<String, String>> history) { this.history = history; }
}
