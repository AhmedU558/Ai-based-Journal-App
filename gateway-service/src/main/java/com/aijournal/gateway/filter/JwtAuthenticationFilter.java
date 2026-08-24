package com.aijournal.gateway.filter;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.factory.AbstractGatewayFilterFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Component
public class JwtAuthenticationFilter extends AbstractGatewayFilterFactory<JwtAuthenticationFilter.Config> {

    @Value("${jwt.secret}")
    private String jwtSecret;

    private static final String HEADER_USER_ID = "X-User-Id";

    // Exact-match only - these are real, complete endpoint paths, not prefixes.
    // A naive startsWith() here previously let "/api/v1/auth/login-history"
    // (an authenticated endpoint) match the "/api/v1/auth/login" entry and skip
    // gateway-level JWT validation entirely.
    private static final List<String> EXACT_EXCLUDED_PATHS = List.of(
            "/api/v1/auth/login",
            "/api/v1/auth/register",
            "/api/v1/auth/refresh",
            "/api/v1/auth/logout",
            "/api/v1/auth/mfa/verify",
            "/api/v1/auth/password/forgot",
            "/api/v1/auth/password/reset",
            "/api/v1/auth/oauth2"
    );

    // Genuine prefixes - these paths have real sub-paths that all need to be excluded
    // (e.g. /actuator/health, /actuator/info).
    private static final List<String> PREFIX_EXCLUDED_PATHS = List.of(
            "/swagger-ui",
            "/v3/api-docs",
            "/actuator"
    );

    public JwtAuthenticationFilter() {
        super(Config.class);
    }

    @Override
    public GatewayFilter apply(Config config) {
        return (exchange, chain) -> {
            ServerHttpRequest request = exchange.getRequest();
            String path = request.getURI().getPath();

            if (isExcluded(path)) {
                return chain.filter(stripTrustedHeaders(exchange));
            }

            return authenticateAndFilter(exchange, chain);
        };
    }

    private boolean isExcluded(String path) {
        return EXACT_EXCLUDED_PATHS.contains(path) || PREFIX_EXCLUDED_PATHS.stream().anyMatch(path::startsWith);
    }

    // Public/excluded paths skip JWT validation entirely, so nothing here ever
    // derives a real userId/email to set - but without this, a request could
    // carry its own forged X-User-Id/X-User-Email straight through to
    // whatever service handles the path. Not exploitable today (no public
    // path trusts a header-based identity), but this closes the gap so that
    // stays true by construction rather than by every future public endpoint
    // remembering not to trust these headers.
    private ServerWebExchange stripTrustedHeaders(ServerWebExchange exchange) {
        ServerHttpRequest strippedRequest = exchange.getRequest().mutate()
                .headers(headers -> {
                    headers.remove(HEADER_USER_ID);
                    headers.remove("X-User-Email");
                })
                .build();
        return exchange.mutate().request(strippedRequest).build();
    }

    private Mono<Void> authenticateAndFilter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String authHeader = request.getHeaders().getFirst(HttpHeaders.AUTHORIZATION);

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return reject(exchange);
        }

        try {
            Claims claims = parseToken(authHeader.substring(7));
            if (claims.get("userId") == null) {
                return reject(exchange);
            }
            return proceedWithClaims(exchange, chain, claims);
        } catch (Exception e) {
            return reject(exchange);
        }
    }

    private Claims parseToken(String token) {
        SecretKey key = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private Mono<Void> proceedWithClaims(ServerWebExchange exchange, GatewayFilterChain chain, Claims claims) {
        String userId = String.valueOf(claims.get("userId"));
        String email = claims.getSubject() != null ? claims.getSubject() : "user@example.com";

        ServerHttpRequest modifiedRequest = exchange.getRequest().mutate()
                .header(HEADER_USER_ID, userId)
                .header("X-User-Email", email)
                .build();
        return chain.filter(exchange.mutate().request(modifiedRequest).build());
    }

    private Mono<Void> reject(ServerWebExchange exchange) {
        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
        return exchange.getResponse().setComplete();
    }

    @SuppressWarnings("java:S2094")
    public static class Config {
        // Configuration properties can be added here if gateway filter behavior needs to be configured via application.yml
    }
}
