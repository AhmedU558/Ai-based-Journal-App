package com.aijournal.auth.controller;

import com.aijournal.auth.dto.AuthResponse;
import com.aijournal.auth.dto.LoginRequest;
import com.aijournal.auth.dto.MfaChallengeResponse;
import com.aijournal.auth.dto.RefreshTokenRequest;
import com.aijournal.auth.dto.RegisterRequest;
import com.aijournal.auth.service.AuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    @Mock
    private AuthService authService;

    private AuthController controller;

    @BeforeEach
    void setUp() {
        controller = new AuthController(authService);
        ReflectionTestUtils.setField(controller, "cookieSecure", false);
        ReflectionTestUtils.setField(controller, "refreshExpirationMs", 604_800_000L);
    }

    private AuthResponse authResponse(String refreshToken) {
        return new AuthResponse("access-token", refreshToken, 1L, "user1", "user1@example.com", List.of("ROLE_USER"));
    }

    @Test
    void register_Success_SetsHttpOnlyRefreshTokenCookie() {
        when(authService.register(any(RegisterRequest.class), any())).thenReturn(authResponse("real-refresh-token"));
        MockHttpServletRequest httpRequest = new MockHttpServletRequest();
        MockHttpServletResponse httpResponse = new MockHttpServletResponse();

        controller.register(new RegisterRequest(), httpRequest, httpResponse);

        String setCookie = httpResponse.getHeader(HttpHeaders.SET_COOKIE);
        assertThat(setCookie).contains("refresh_token=real-refresh-token");
        assertThat(setCookie).containsIgnoringCase("HttpOnly");
        assertThat(setCookie).containsIgnoringCase("SameSite=Strict");
        assertThat(setCookie).contains("Path=/api/v1/auth");
    }

    @Test
    void login_MfaNotRequired_SetsRefreshTokenCookie() {
        when(authService.login(any(LoginRequest.class), any(), any())).thenReturn(authResponse("real-refresh-token"));
        MockHttpServletRequest httpRequest = new MockHttpServletRequest();
        MockHttpServletResponse httpResponse = new MockHttpServletResponse();

        controller.login(new LoginRequest(), httpRequest, httpResponse);

        assertThat(httpResponse.getHeader(HttpHeaders.SET_COOKIE)).contains("refresh_token=real-refresh-token");
    }

    @Test
    void login_MfaRequired_DoesNotSetRefreshTokenCookie() {
        // An MfaChallengeResponse has no refresh token yet - login isn't
        // complete, so there's nothing real to set a cookie with.
        when(authService.login(any(LoginRequest.class), any(), any()))
                .thenReturn(new MfaChallengeResponse("challenge-token", "MFA code required"));
        MockHttpServletRequest httpRequest = new MockHttpServletRequest();
        MockHttpServletResponse httpResponse = new MockHttpServletResponse();

        controller.login(new LoginRequest(), httpRequest, httpResponse);

        assertThat(httpResponse.getHeader(HttpHeaders.SET_COOKIE)).isNull();
    }

    @Test
    void refreshToken_BodyOmitsToken_FallsBackToCookie() {
        MockHttpServletRequest httpRequest = new MockHttpServletRequest();
        httpRequest.setCookies(new jakarta.servlet.http.Cookie("refresh_token", "cookie-refresh-value"));
        MockHttpServletResponse httpResponse = new MockHttpServletResponse();
        ArgumentCaptor<RefreshTokenRequest> captor = ArgumentCaptor.forClass(RefreshTokenRequest.class);
        when(authService.refreshToken(captor.capture())).thenReturn(authResponse("rotated-refresh-token"));

        controller.refreshToken(new RefreshTokenRequest(null), httpRequest, httpResponse);

        assertThat(captor.getValue().getRefreshToken()).isEqualTo("cookie-refresh-value");
        assertThat(httpResponse.getHeader(HttpHeaders.SET_COOKIE)).contains("refresh_token=rotated-refresh-token");
    }

    @Test
    void refreshToken_BodyProvidesToken_PrefersBodyOverCookie() {
        // Mobile has no cookie jar and always sends this explicitly.
        MockHttpServletRequest httpRequest = new MockHttpServletRequest();
        httpRequest.setCookies(new jakarta.servlet.http.Cookie("refresh_token", "stale-cookie-value"));
        MockHttpServletResponse httpResponse = new MockHttpServletResponse();
        ArgumentCaptor<RefreshTokenRequest> captor = ArgumentCaptor.forClass(RefreshTokenRequest.class);
        when(authService.refreshToken(captor.capture())).thenReturn(authResponse("rotated-refresh-token"));

        controller.refreshToken(new RefreshTokenRequest("mobile-body-token"), httpRequest, httpResponse);

        assertThat(captor.getValue().getRefreshToken()).isEqualTo("mobile-body-token");
    }

    @Test
    void logout_BodyOmitsToken_FallsBackToCookieAndClearsIt() {
        MockHttpServletRequest httpRequest = new MockHttpServletRequest();
        httpRequest.setCookies(new jakarta.servlet.http.Cookie("refresh_token", "cookie-refresh-value"));
        MockHttpServletResponse httpResponse = new MockHttpServletResponse();

        controller.logout(new RefreshTokenRequest(null), httpRequest, httpResponse);

        verify(authService).logout(eq("cookie-refresh-value"));
        String setCookie = httpResponse.getHeader(HttpHeaders.SET_COOKIE);
        assertThat(setCookie).contains("refresh_token=");
        assertThat(setCookie).contains("Max-Age=0");
    }
}
