package com.aijournal.auth.controller;

import com.aijournal.auth.dto.*;
import com.aijournal.auth.service.AuthService;
import com.aijournal.common.dto.ApiResponse;
import com.aijournal.common.dto.PagedResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Authentication API", description = "Endpoints for User Registration, Login, Token Refresh, MFA, and Account Security")
public class AuthController {

    // Scoped narrowly to the auth paths that actually read it - no reason
    // for this cookie to be attached to every request to every service.
    private static final String REFRESH_COOKIE_NAME = "refresh_token";
    private static final String REFRESH_COOKIE_PATH = "/api/v1/auth";

    private final AuthService authService;

    // Real HTTPS in prod (behind the host nginx TLS termination the deploy
    // runbook already documents) but the whole stack runs over plain HTTP
    // in local Docker dev - a hardcoded Secure=true cookie would silently
    // never be sent by the browser over http://localhost, breaking local
    // login/refresh entirely. Overridden to false only in dev compose.
    @Value("${auth.cookie.secure:true}")
    private boolean cookieSecure;

    @Value("${jwt.refresh-expiration-ms:604800000}")
    private long refreshExpirationMs;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    // X-Real-IP is set by gateway-service's ClientIpHeaderFilter on every
    // proxied request; getRemoteAddr() is the fallback for local/non-gateway dev.
    private String resolveClientIp(HttpServletRequest request) {
        String realIp = request.getHeader("X-Real-IP");
        return realIp != null ? realIp : request.getRemoteAddr();
    }

    // Refresh tokens stored in localStorage are readable by any XSS payload
    // that ever runs on the page - an httpOnly cookie is invisible to page
    // JS entirely, so an XSS bug can no longer exfiltrate a long-lived
    // (7-day) credential. Mobile has no cookie jar to rely on, so it keeps
    // getting the token in the JSON response body too (unchanged for it) -
    // only the web frontend was changed to stop persisting this value itself.
    private void setRefreshTokenCookie(HttpServletResponse response, String refreshToken) {
        ResponseCookie cookie = ResponseCookie.from(REFRESH_COOKIE_NAME, refreshToken)
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite("Strict")
                .path(REFRESH_COOKIE_PATH)
                .maxAge(Duration.ofMillis(refreshExpirationMs))
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private void clearRefreshTokenCookie(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from(REFRESH_COOKIE_NAME, "")
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite("Strict")
                .path(REFRESH_COOKIE_PATH)
                .maxAge(0)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    // Prefers an explicit body value (mobile) over the cookie (web) - lets
    // both clients keep hitting the exact same endpoint with no version
    // branching.
    private String resolveRefreshToken(String bodyValue, HttpServletRequest request) {
        if (bodyValue != null && !bodyValue.isBlank()) {
            return bodyValue;
        }
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (REFRESH_COOKIE_NAME.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    @PostMapping("/register")
    @Operation(summary = "Register a new user account")
    public ResponseEntity<ApiResponse<AuthResponse>> register(@Valid @RequestBody RegisterRequest request,
            HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        AuthResponse response = authService.register(request, resolveClientIp(httpRequest));
        setRefreshTokenCookie(httpResponse, response.getRefreshToken());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("User registered successfully", response));
    }

    @PostMapping("/login")
    @Operation(summary = "Authenticate user and receive JWT tokens, or an MFA challenge if 2FA is enabled")
    public ResponseEntity<ApiResponse<Object>> login(@Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        Object response = authService.login(request, resolveClientIp(httpRequest), httpRequest.getHeader("User-Agent"));
        if (response instanceof AuthResponse authResponse) {
            setRefreshTokenCookie(httpResponse, authResponse.getRefreshToken());
        }
        return ResponseEntity.ok(ApiResponse.success("Login successful", response));
    }

    @PostMapping("/mfa/verify")
    @Operation(summary = "Complete login by verifying a TOTP code or recovery code against an MFA challenge")
    public ResponseEntity<ApiResponse<AuthResponse>> verifyMfa(@Valid @RequestBody MfaVerifyRequest request,
            HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        AuthResponse response = authService.verifyMfa(request, resolveClientIp(httpRequest), httpRequest.getHeader("User-Agent"));
        setRefreshTokenCookie(httpResponse, response.getRefreshToken());
        return ResponseEntity.ok(ApiResponse.success("Login successful", response));
    }

    @GetMapping("/login-history")
    @Operation(summary = "List the authenticated user's own recent login attempts, newest first")
    public ResponseEntity<ApiResponse<PagedResponse<LoginHistoryResponse>>> getLoginHistory(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return ResponseEntity.ok(ApiResponse.success(authService.getLoginHistory(userId, pageable)));
    }

    @PostMapping("/refresh")
    @Operation(summary = "Refresh JWT access token using sliding refresh token")
    public ResponseEntity<ApiResponse<AuthResponse>> refreshToken(@Valid @RequestBody RefreshTokenRequest request,
            HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        String tokenValue = resolveRefreshToken(request.getRefreshToken(), httpRequest);
        RefreshTokenRequest resolvedRequest = new RefreshTokenRequest(tokenValue);
        AuthResponse response = authService.refreshToken(resolvedRequest);
        setRefreshTokenCookie(httpResponse, response.getRefreshToken());
        return ResponseEntity.ok(ApiResponse.success("Token refreshed successfully", response));
    }

    @PostMapping("/logout")
    @Operation(summary = "Revoke refresh token and logout")
    public ResponseEntity<ApiResponse<Void>> logout(@Valid @RequestBody RefreshTokenRequest request,
            HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        String tokenValue = resolveRefreshToken(request.getRefreshToken(), httpRequest);
        authService.logout(tokenValue);
        clearRefreshTokenCookie(httpResponse);
        return ResponseEntity.ok(ApiResponse.success("Logged out successfully", null));
    }

    @GetMapping("/me")
    @Operation(summary = "Get the authenticated user's identity")
    public ResponseEntity<ApiResponse<CurrentUserResponse>> getCurrentUser(
            @RequestHeader("X-User-Id") Long userId) {
        return ResponseEntity.ok(ApiResponse.success(authService.getCurrentUser(userId)));
    }

    @PutMapping("/password")
    @Operation(summary = "Change the authenticated user's password")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @RequestHeader("X-User-Id") Long userId, @Valid @RequestBody ChangePasswordRequest request) {
        authService.changePassword(userId, request);
        return ResponseEntity.ok(ApiResponse.success("Password changed successfully", null));
    }

    @PostMapping("/password/forgot")
    @Operation(summary = "Request a password reset code by email - always returns the same generic response")
    public ResponseEntity<ApiResponse<Void>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        authService.forgotPassword(request);
        return ResponseEntity.ok(ApiResponse.success("If that email is registered, a reset code has been sent.", null));
    }

    @PostMapping("/password/reset")
    @Operation(summary = "Reset a password using a code emailed by /password/forgot")
    public ResponseEntity<ApiResponse<Void>> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request);
        return ResponseEntity.ok(ApiResponse.success("Password reset successfully", null));
    }

    @GetMapping("/mfa/status")
    @Operation(summary = "Check whether the authenticated user has 2FA enabled")
    public ResponseEntity<ApiResponse<MfaStatusResponse>> getMfaStatus(@RequestHeader("X-User-Id") Long userId) {
        return ResponseEntity.ok(ApiResponse.success(authService.getMfaStatus(userId)));
    }

    @PostMapping("/mfa/setup")
    @Operation(summary = "Generate a new TOTP secret for 2FA enrollment (not yet enabled)")
    public ResponseEntity<ApiResponse<MfaSetupResponse>> setupMfa(@RequestHeader("X-User-Id") Long userId) {
        return ResponseEntity.ok(ApiResponse.success(authService.setupMfa(userId)));
    }

    @PostMapping("/mfa/enable")
    @Operation(summary = "Confirm 2FA enrollment with a verification code and receive one-time recovery codes")
    public ResponseEntity<ApiResponse<MfaEnableResponse>> enableMfa(
            @RequestHeader("X-User-Id") Long userId, @Valid @RequestBody MfaEnableRequest request) {
        return ResponseEntity.ok(ApiResponse.success(authService.enableMfa(userId, request)));
    }

    @PostMapping("/mfa/disable")
    @Operation(summary = "Disable 2FA (requires current password and a valid code)")
    public ResponseEntity<ApiResponse<Void>> disableMfa(
            @RequestHeader("X-User-Id") Long userId, @Valid @RequestBody MfaDisableRequest request) {
        authService.disableMfa(userId, request);
        return ResponseEntity.ok(ApiResponse.success("2FA disabled", null));
    }

    @PostMapping("/verify-email")
    @Operation(summary = "Verify the authenticated user's email address with a code sent at registration")
    public ResponseEntity<ApiResponse<Void>> verifyEmail(
            @RequestHeader("X-User-Id") Long userId, @Valid @RequestBody VerifyEmailRequest request) {
        authService.verifyEmail(userId, request);
        return ResponseEntity.ok(ApiResponse.success("Email verified successfully", null));
    }

    @PostMapping("/verify-email/resend")
    @Operation(summary = "Resend the authenticated user's email verification code")
    public ResponseEntity<ApiResponse<Void>> resendVerificationEmail(@RequestHeader("X-User-Id") Long userId) {
        authService.resendVerificationEmail(userId);
        return ResponseEntity.ok(ApiResponse.success("Verification email sent", null));
    }

    @DeleteMapping("/account")
    @Operation(summary = "Delete the authenticated user's login credentials (internal - called by user-service's account-deletion flow)")
    public ResponseEntity<ApiResponse<Void>> deleteOwnAccount(@RequestHeader("X-User-Id") Long userId) {
        authService.deleteOwnAccount(userId);
        return ResponseEntity.ok(ApiResponse.success("Account credentials deleted", null));
    }
}
