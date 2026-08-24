package com.aijournal.auth.service.impl;
import com.aijournal.common.http.RestTemplateFactory;

import com.aijournal.auth.dto.UserSummaryResponse;
import com.aijournal.auth.entity.Role;
import com.aijournal.auth.entity.User;
import com.aijournal.auth.repository.MfaChallengeRepository;
import com.aijournal.auth.repository.MfaRecoveryCodeRepository;
import com.aijournal.auth.repository.RefreshTokenRepository;
import com.aijournal.auth.repository.RoleRepository;
import com.aijournal.auth.repository.UserRepository;
import com.aijournal.auth.service.AdminService;
import com.aijournal.common.dto.PagedResponse;
import com.aijournal.common.exception.BadRequestException;
import com.aijournal.common.exception.ResourceNotFoundException;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executor;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

@Service
public class AdminServiceImpl implements AdminService {

    private static final Logger log = LoggerFactory.getLogger(AdminServiceImpl.class);
    private static final int SYSTEM_TOKEN_TTL_SECONDS = 60;

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final MfaChallengeRepository mfaChallengeRepository;
    private final MfaRecoveryCodeRepository mfaRecoveryCodeRepository;
    private final RestTemplate restTemplate = RestTemplateFactory.create();
    // Bounded (not Executors.newCachedThreadPool()) - same reasoning as
    // AuthServiceImpl's identical field: an unbounded cached pool could spawn
    // one native thread per best-effort notification call under a surge,
    // until the JVM runs out of threads. CallerRunsPolicy degrades to
    // synchronous execution on saturation instead of throwing or dropping work.
    private Executor notificationExecutor = new ThreadPoolExecutor(
            2, 10, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(100),
            new ThreadPoolExecutor.CallerRunsPolicy());

    @Value("${jwt.secret}")
    private String jwtSecret;

    @Value("${notification.service.url:http://notification-service:8087}")
    private String notificationServiceUrl;

    public AdminServiceImpl(UserRepository userRepository, RoleRepository roleRepository,
                             RefreshTokenRepository refreshTokenRepository, MfaChallengeRepository mfaChallengeRepository,
                             MfaRecoveryCodeRepository mfaRecoveryCodeRepository) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.mfaChallengeRepository = mfaChallengeRepository;
        this.mfaRecoveryCodeRepository = mfaRecoveryCodeRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<UserSummaryResponse> listUsers(Pageable pageable) {
        Page<User> page = userRepository.findAll(pageable);
        return new PagedResponse<>(
                page.getContent().stream().map(this::toSummary).toList(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages(),
                page.isLast(),
                page.isFirst()
        );
    }

    @Override
    @Transactional
    public UserSummaryResponse updateRoles(Long targetUserId, Long callerId, Set<String> roleNames) {
        User target = getUserOrThrow(targetUserId);

        Set<Role.RoleName> requested = new HashSet<>();
        for (String name : roleNames) {
            try {
                requested.add(Role.RoleName.valueOf(name));
            } catch (IllegalArgumentException e) {
                throw new BadRequestException("Unknown role: " + name);
            }
        }
        // Every user always keeps ROLE_USER regardless of what's requested -
        // this endpoint can never lock a user out of baseline access.
        requested.add(Role.RoleName.ROLE_USER);

        if (targetUserId.equals(callerId) && !requested.contains(Role.RoleName.ROLE_ADMIN)) {
            throw new BadRequestException("You cannot remove your own ROLE_ADMIN.");
        }

        Set<Role> roles = new HashSet<>();
        for (Role.RoleName name : requested) {
            roles.add(roleRepository.findByName(name)
                    .orElseThrow(() -> new ResourceNotFoundException("Role", "name", name)));
        }
        target.setRoles(roles);
        User saved = userRepository.save(target);
        return toSummary(saved);
    }

    @Override
    @Transactional
    public UserSummaryResponse updateStatus(Long targetUserId, Long callerId, boolean enabled) {
        if (targetUserId.equals(callerId)) {
            throw new BadRequestException("You cannot change your own account status.");
        }
        User target = getUserOrThrow(targetUserId);
        target.setEnabled(enabled);
        User saved = userRepository.save(target);
        if (!enabled) {
            // Same reasoning as changePassword's stolen-device handling - a
            // disabled account's active session must not survive. Also purge
            // any outstanding MFA challenge - without this, a user mid-login
            // (password already accepted, MFA not yet completed) could still
            // finish /mfa/verify and mint fresh tokens after being disabled.
            refreshTokenRepository.deleteByUser(saved);
            mfaChallengeRepository.deleteByUser(saved);
            notifyAccountEventBestEffort(saved, "Your account was disabled by an administrator.");
        }
        return toSummary(saved);
    }

    @Override
    @Transactional
    public UserSummaryResponse resetMfa(Long targetUserId, Long callerId) {
        if (targetUserId.equals(callerId)) {
            // Forces an admin to use their own normal disable-2FA flow (which
            // already has a recovery-code path) for their own account, rather
            // than a second, weaker way to strip their own second factor.
            throw new BadRequestException("Use the normal disable-2FA flow for your own account.");
        }
        User target = getUserOrThrow(targetUserId);
        target.setMfaEnabled(false);
        target.setTotpSecret(null);
        User saved = userRepository.save(target);
        mfaRecoveryCodeRepository.deleteByUser(saved);
        mfaChallengeRepository.deleteByUser(saved);
        notifyAccountEventBestEffort(saved,
                "Two-factor authentication was reset by an administrator. Please set it up again if you'd like to keep using it.");
        return toSummary(saved);
    }

    private User getUserOrThrow(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
    }

    // Mechanical duplicate of AuthServiceImpl's mintSystemToken()/notify
    // helper - same reasoning this codebase already applies to small
    // purpose-named infrastructure (e.g. TotpEncryptionService vs.
    // JournalEncryptionService) over a shared abstraction for a few lines.
    private String mintSystemToken() {
        SecretKey key = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
        Instant now = Instant.now();
        return Jwts.builder()
                .subject("system")
                .claim("userId", 0L)
                .claim("roles", List.of("ROLE_SYSTEM"))
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(SYSTEM_TOKEN_TTL_SECONDS)))
                .signWith(key)
                .compact();
    }

    private void notifyAccountEventBestEffort(User user, String message) {
        notificationExecutor.execute(() -> {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + mintSystemToken());
                Map<String, Object> body = Map.of(
                        "userId", user.getId(),
                        "type", "SECURITY",
                        "message", message
                );
                restTemplate.postForEntity(notificationServiceUrl + "/api/v1/notifications",
                        new HttpEntity<>(body, headers), Void.class);
            } catch (Exception e) {
                log.warn("Could not create account-event notification for user {}: {}", user.getId(), e.getMessage());
            }
        });
    }

    private UserSummaryResponse toSummary(User user) {
        return new UserSummaryResponse(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getFullName(),
                user.getRoles().stream().map(r -> r.getName().name()).sorted().toList(),
                user.getEnabled(),
                user.getMfaEnabled(),
                user.getCreatedAt()
        );
    }
}
