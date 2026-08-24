package com.aijournal.auth.dto;

public class RefreshTokenRequest {

    // Deliberately not @NotBlank: the web client no longer sends this in the
    // body at all - the browser attaches the httpOnly refresh-token cookie
    // automatically, and AuthController falls back to reading that cookie
    // when this field is absent. Mobile (no cookie jar) still sends it here
    // explicitly. AuthServiceImpl.refreshToken()/logout() already treat an
    // unresolvable token as "invalid" (a 401), so a genuinely missing value
    // from both sources fails the same way it always did.
    private String refreshToken;

    public RefreshTokenRequest() {
    }

    public RefreshTokenRequest(String refreshToken) {
        this.refreshToken = refreshToken;
    }

    public String getRefreshToken() { return refreshToken; }
    public void setRefreshToken(String refreshToken) { this.refreshToken = refreshToken; }
}
