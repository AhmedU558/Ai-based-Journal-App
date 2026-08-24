package com.aijournal.gateway.filter;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class JwtAuthenticationFilterTest {

    private static final String SECRET = "test-jwt-secret-key-at-least-256-bits-long-for-hs256!!";

    private final JwtAuthenticationFilter factory = new JwtAuthenticationFilter();

    private GatewayFilter filter() {
        ReflectionTestUtils.setField(factory, "jwtSecret", SECRET);
        return factory.apply(new JwtAuthenticationFilter.Config());
    }

    private String buildToken(long expiresInMillis, Long userId, String subject) {
        SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
        Date now = new Date();
        var builder = Jwts.builder()
                .issuedAt(now)
                .expiration(new Date(now.getTime() + expiresInMillis))
                .signWith(key);
        if (subject != null) {
            builder.subject(subject);
        }
        if (userId != null) {
            builder.claim("userId", userId);
        }
        return builder.compact();
    }

    @Test
    void filter_ExcludedLoginPath_BypassesAuthAndForwards() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.post("/api/v1/auth/login"));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        when(chain.filter(any())).thenReturn(Mono.empty());

        StepVerifier.create(filter().filter(exchange, chain)).verifyComplete();

        verify(chain).filter(any());
        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void filter_ExcludedPath_StripsForgedTrustedIdentityHeaders() {
        // Regression guard: an excluded/public path never validates a JWT, so
        // nothing here ever derives a real userId/email - but before this fix,
        // whatever X-User-Id/X-User-Email a client sent passed straight
        // through unmodified to the downstream service.
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.post("/api/v1/auth/login")
                        .header("X-User-Id", "999")
                        .header("X-User-Email", "attacker@example.com"));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        when(chain.filter(any())).thenReturn(Mono.empty());

        StepVerifier.create(filter().filter(exchange, chain)).verifyComplete();

        ArgumentCaptor<ServerWebExchange> captor = ArgumentCaptor.forClass(ServerWebExchange.class);
        verify(chain).filter(captor.capture());
        assertThat(captor.getValue().getRequest().getHeaders().getFirst("X-User-Id")).isNull();
        assertThat(captor.getValue().getRequest().getHeaders().getFirst("X-User-Email")).isNull();
    }

    @Test
    void filter_LoginHistoryPath_IsNotTreatedAsExcludedDespitePrefixOverlapWithLogin() {
        // Regression guard: EXCLUDED_PATHS used to be matched via startsWith(),
        // so "/api/v1/auth/login-history" (a real, authenticated endpoint)
        // silently matched the "/api/v1/auth/login" entry and skipped JWT
        // validation entirely at the gateway.
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/auth/login-history"));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);

        StepVerifier.create(filter().filter(exchange, chain)).verifyComplete();

        verifyNoInteractions(chain);
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void filter_ActuatorHealthSubPath_StillExcludedViaGenuinePrefixMatch() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/actuator/health"));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        when(chain.filter(any())).thenReturn(Mono.empty());

        StepVerifier.create(filter().filter(exchange, chain)).verifyComplete();

        verify(chain).filter(any());
        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void filter_MissingAuthHeader_Returns401AndDoesNotInvokeChain() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/journals"));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);

        StepVerifier.create(filter().filter(exchange, chain)).verifyComplete();

        verifyNoInteractions(chain);
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void filter_NonBearerAuthHeader_Returns401() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/journals").header("Authorization", "Basic dXNlcjpwYXNz"));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);

        StepVerifier.create(filter().filter(exchange, chain)).verifyComplete();

        verifyNoInteractions(chain);
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void filter_MalformedToken_Returns401() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/journals").header("Authorization", "Bearer not-a-real-jwt"));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);

        StepVerifier.create(filter().filter(exchange, chain)).verifyComplete();

        verifyNoInteractions(chain);
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void filter_ExpiredToken_Returns401() {
        String token = buildToken(-60_000, 1L, "user@example.com");
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/journals").header("Authorization", "Bearer " + token));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);

        StepVerifier.create(filter().filter(exchange, chain)).verifyComplete();

        verifyNoInteractions(chain);
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void filter_ValidTokenMissingUserIdClaim_Returns401() {
        String token = buildToken(60_000, null, "user@example.com");
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/journals").header("Authorization", "Bearer " + token));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);

        StepVerifier.create(filter().filter(exchange, chain)).verifyComplete();

        verifyNoInteractions(chain);
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void filter_ValidToken_InjectsUserIdAndEmailHeadersAndForwards() {
        String token = buildToken(60_000, 42L, "user@example.com");
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/journals").header("Authorization", "Bearer " + token));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        when(chain.filter(any())).thenReturn(Mono.empty());

        StepVerifier.create(filter().filter(exchange, chain)).verifyComplete();

        ArgumentCaptor<ServerWebExchange> captor = ArgumentCaptor.forClass(ServerWebExchange.class);
        verify(chain).filter(captor.capture());
        assertThat(captor.getValue().getRequest().getHeaders().getFirst("X-User-Id")).isEqualTo("42");
        assertThat(captor.getValue().getRequest().getHeaders().getFirst("X-User-Email")).isEqualTo("user@example.com");
    }

    @Test
    void filter_ValidTokenNoSubject_DefaultsEmailHeader() {
        String token = buildToken(60_000, 42L, null);
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/journals").header("Authorization", "Bearer " + token));
        GatewayFilterChain chain = mock(GatewayFilterChain.class);
        when(chain.filter(any())).thenReturn(Mono.empty());

        StepVerifier.create(filter().filter(exchange, chain)).verifyComplete();

        ArgumentCaptor<ServerWebExchange> captor = ArgumentCaptor.forClass(ServerWebExchange.class);
        verify(chain).filter(captor.capture());
        assertThat(captor.getValue().getRequest().getHeaders().getFirst("X-User-Email")).isEqualTo("user@example.com");
    }
}
