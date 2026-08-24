package com.aijournal.auth.service.impl;
import com.aijournal.common.http.RestTemplateFactory;

import com.aijournal.auth.dto.*;
import com.aijournal.auth.entity.EmailVerificationToken;
import com.aijournal.auth.entity.LoginHistory;
import com.aijournal.auth.entity.MfaChallenge;
import com.aijournal.auth.entity.MfaRecoveryCode;
import com.aijournal.auth.entity.PasswordResetToken;
import com.aijournal.auth.entity.RefreshToken;
import com.aijournal.auth.entity.Role;
import com.aijournal.auth.entity.User;
import com.aijournal.auth.repository.EmailVerificationTokenRepository;
import com.aijournal.auth.repository.LoginHistoryRepository;
import com.aijournal.auth.repository.MfaChallengeRepository;
import com.aijournal.auth.repository.MfaRecoveryCodeRepository;
import com.aijournal.auth.repository.PasswordResetTokenRepository;
import com.aijournal.auth.repository.RefreshTokenRepository;
import com.aijournal.auth.repository.RoleRepository;
import com.aijournal.auth.repository.UserRepository;
import com.aijournal.auth.service.AuthService;
import com.aijournal.auth.service.LoginHistoryRecorder;
import com.aijournal.auth.service.TotpEncryptionService;
import com.aijournal.auth.service.TotpService;
import com.aijournal.auth.service.TurnstileService;
import com.aijournal.common.dto.PagedResponse;
import com.aijournal.common.exception.BadRequestException;
import com.aijournal.common.exception.ForbiddenException;
import com.aijournal.common.exception.ResourceNotFoundException;
import com.aijournal.common.exception.UnauthorizedException;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.Executor;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

@Service
public class AuthServiceImpl implements AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthServiceImpl.class);

    private static final int RECOVERY_CODE_COUNT = 10;
    private static final int MFA_CHALLENGE_TTL_MINUTES = 5;
    private static final int PASSWORD_RESET_TTL_MINUTES = 30;
    private static final int EMAIL_VERIFICATION_TTL_HOURS = 24;
    private static final int SYSTEM_TOKEN_TTL_SECONDS = 60;
    private static final String REGISTRATION_FAILED_MESSAGE =
            "Registration failed. Please choose a different username or use a different email address.";
    private static final SecureRandom RECOVERY_CODE_RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final MfaChallengeRepository mfaChallengeRepository;
    private final MfaRecoveryCodeRepository mfaRecoveryCodeRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final EmailVerificationTokenRepository emailVerificationTokenRepository;
    private final LoginHistoryRepository loginHistoryRepository;
    private final LoginHistoryRecorder loginHistoryRecorder;
    private final PasswordEncoder passwordEncoder;
    private final TotpService totpService;
    private final TotpEncryptionService totpEncryptionService;
    private final RestTemplate restTemplate = RestTemplateFactory.create();
    // Fire-and-forget executor for every best-effort call into
    // notification-service - keeping these off the calling thread means the
    // HTTP response returns before the background network call even starts,
    // which is what closes the forgotPassword timing side-channel (a
    // registered vs. unregistered email used to take measurably different
    // time to respond). Not Spring's @Async: these are private same-class
    // methods, so AOP self-invocation would silently never intercept them.
    // Swapped for a synchronous Runnable::run executor in tests.
    // Bounded (not Executors.newCachedThreadPool(), which allows up to
    // Integer.MAX_VALUE threads) - a login/registration surge could
    // otherwise spawn unboundedly many threads, one per best-effort
    // notification call, until the JVM runs out of native threads.
    // CallerRunsPolicy means saturation degrades to synchronous execution
    // on the calling thread rather than throwing or dropping the
    // notification.
    private Executor notificationExecutor = new ThreadPoolExecutor(
            2, 10, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(100),
            new ThreadPoolExecutor.CallerRunsPolicy());

    @Value("${jwt.secret}")
    private String jwtSecret;

    @Value("${jwt.expiration-ms:900000}") // 15 mins default
    private long jwtExpirationMs;

    @Value("${jwt.refresh-expiration-ms:604800000}") // 7 days default
    private long refreshExpirationMs;

    @Value("${notification.service.url:http://notification-service:8087}")
    private String notificationServiceUrl;

    private final TurnstileService turnstileService;

    public AuthServiceImpl(UserRepository userRepository, RoleRepository roleRepository,
            RefreshTokenRepository refreshTokenRepository, MfaChallengeRepository mfaChallengeRepository,
            MfaRecoveryCodeRepository mfaRecoveryCodeRepository, PasswordResetTokenRepository passwordResetTokenRepository,
            EmailVerificationTokenRepository emailVerificationTokenRepository, LoginHistoryRepository loginHistoryRepository,
            LoginHistoryRecorder loginHistoryRecorder,
            PasswordEncoder passwordEncoder, TotpService totpService, TotpEncryptionService totpEncryptionService,
            TurnstileService turnstileService) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.mfaChallengeRepository = mfaChallengeRepository;
        this.mfaRecoveryCodeRepository = mfaRecoveryCodeRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.emailVerificationTokenRepository = emailVerificationTokenRepository;
        this.loginHistoryRepository = loginHistoryRepository;
        this.loginHistoryRecorder = loginHistoryRecorder;
        this.passwordEncoder = passwordEncoder;
        this.totpService = totpService;
        this.totpEncryptionService = totpEncryptionService;
        this.turnstileService = turnstileService;
    }

    @Override
    @Transactional
    public AuthResponse register(RegisterRequest request, String ipAddress) {
        if (!turnstileService.verify(request.getTurnstileToken(), ipAddress)) {
            throw new BadRequestException("CAPTCHA verification failed. Please try again.");
        }
        // A single generic message for both collisions - telling the caller
        // specifically which of username/email is already taken is an
        // enumeration oracle (can be probed at speed to confirm whether a
        // given email is a real account), the same class of leak
        // forgotPassword() was already hardened against.
        if (userRepository.existsByUsername(request.getUsername()) || userRepository.existsByEmail(request.getEmail())) {
            throw new BadRequestException(REGISTRATION_FAILED_MESSAGE);
        }

        Role userRole = roleRepository.findByName(Role.RoleName.ROLE_USER)
                .orElseGet(() -> roleRepository.save(new Role(null, Role.RoleName.ROLE_USER)));

        Set<Role> roles = new HashSet<>();
        roles.add(userRole);

        User user = new User(
                null,
                request.getUsername(),
                request.getEmail(),
                passwordEncoder.encode(request.getPassword()),
                request.getFullName(),
                true,
                true,
                User.AuthProvider.LOCAL,
                null,
                roles);

        User savedUser;
        try {
            savedUser = userRepository.save(user);
        } catch (DataIntegrityViolationException e) {
            // The existsByUsername/existsByEmail check above and this save()
            // aren't atomic - two concurrent registrations with the same
            // username/email can both pass the check before either commits,
            // and the DB's own unique constraint rejects the second insert.
            // Surface it as the same clean 400 every other duplicate path
            // returns, not an opaque 500.
            throw new BadRequestException(REGISTRATION_FAILED_MESSAGE);
        }
        AuthResponse response = generateTokensForUser(savedUser);
        sendWelcomeEmailBestEffort(savedUser);
        sendEmailVerificationBestEffort(savedUser);
        return response;
    }

    // Mints the same short-lived internal system token every other
    // notification-service call uses (see mintSystemToken()) rather than
    // forwarding the new user's own access token - notification-service's
    // /send-email endpoint is now locked to ROLE_SYSTEM only, so a normal
    // user's own JWT would no longer be accepted here anyway. Best-effort:
    // a failure here must never fail registration itself.
    private void sendWelcomeEmailBestEffort(User user) {
        notificationExecutor.execute(() -> {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + mintSystemToken());
                Map<String, String> body = Map.of(
                        "to", user.getEmail(),
                        "subject", "Welcome to Mindora!",
                        "body", "Hi " + user.getUsername() + ",\n\nWelcome to Mindora - your AI journaling companion. " +
                                "Start writing your first entry whenever you're ready.\n\nHappy journaling!"
                );
                restTemplate.postForEntity(notificationServiceUrl + "/api/v1/notifications/send-email",
                        new HttpEntity<>(body, headers), Void.class);
            } catch (Exception e) {
                log.warn("Could not send welcome email to {}: {}", user.getEmail(), e.getMessage());
            }
        });
    }

    // Code generation + token save stay synchronous (fast DB write, and
    // unlike forgotPassword this isn't hiding whether an account exists -
    // register() already reveals that via its own success/400 response), only
    // the network call to notification-service is deferred - same shape as
    // sendWelcomeEmailBestEffort/sendPasswordResetEmailBestEffort. A separate
    // email/method from the welcome email (not merged into one) so resend()
    // can reuse this verbatim.
    private void sendEmailVerificationBestEffort(User user) {
        emailVerificationTokenRepository.deleteByUser(user);
        String code = randomEmailVerificationCode();
        emailVerificationTokenRepository.save(new EmailVerificationToken(null, user, code,
                Instant.now().plus(EMAIL_VERIFICATION_TTL_HOURS, ChronoUnit.HOURS)));
        notificationExecutor.execute(() -> {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + mintSystemToken());
                Map<String, String> body = Map.of(
                        "to", user.getEmail(),
                        "subject", "Verify your Mindora email address",
                        "body", "Hi " + user.getUsername() + ",\n\nYour email verification code is: " + code +
                                "\n\nThis code expires in " + EMAIL_VERIFICATION_TTL_HOURS + " hours."
                );
                restTemplate.postForEntity(notificationServiceUrl + "/api/v1/notifications/send-email",
                        new HttpEntity<>(body, headers), Void.class);
            } catch (Exception e) {
                log.warn("Could not send verification email to {}: {}", user.getEmail(), e.getMessage());
            }
        });
    }

    private String randomEmailVerificationCode() {
        // A real numeric OTP - 6 digits, matching the MFA TOTP code convention
        // already used elsewhere in this app, rather than the alphanumeric
        // XXXXX-XXXXX shape used for recovery/reset codes (which are meant to
        // be written down and typed once, not entered quickly like an OTP).
        int code = 100000 + RECOVERY_CODE_RANDOM.nextInt(900000);
        return String.valueOf(code);
    }

    @Override
    @Transactional
    public void verifyEmail(Long userId, VerifyEmailRequest request) {
        User user = getUserOrThrow(userId);
        if (Boolean.TRUE.equals(user.getEmailVerified())) {
            return; // idempotent no-op
        }
        EmailVerificationToken token = emailVerificationTokenRepository.findByVerificationCode(request.getCode())
                .orElseThrow(() -> new UnauthorizedException("Invalid or expired verification code"));

        if (!token.getUser().getId().equals(userId)) {
            // Don't reveal that the code is valid but belongs to someone else.
            throw new UnauthorizedException("Invalid or expired verification code");
        }
        if (token.getExpiresAt().isBefore(Instant.now())) {
            emailVerificationTokenRepository.delete(token);
            throw new UnauthorizedException("Verification code expired, please request a new one");
        }

        user.setEmailVerified(true);
        userRepository.save(user);
        emailVerificationTokenRepository.delete(token);
        notifyAccountEventBestEffort(user, "Your email address was verified.");
    }

    @Override
    @Transactional
    public void resendVerificationEmail(Long userId) {
        User user = getUserOrThrow(userId);
        if (Boolean.TRUE.equals(user.getEmailVerified())) {
            throw new BadRequestException("Your email is already verified.");
        }
        sendEmailVerificationBestEffort(user);
    }

    @Override
    @Transactional
    public void deleteOwnAccount(Long userId) {
        User user = getUserOrThrow(userId);
        // Every FK referencing users(id) in auth_db (user_roles,
        // refresh_tokens, login_history, mfa_recovery_codes, mfa_challenges,
        // password_reset_tokens, email_verification_tokens) is declared
        // ON DELETE CASCADE - deleting the row itself is enough to remove
        // the caller's ability to ever log in again with these credentials.
        userRepository.delete(user);
    }

    @Override
    @Transactional
    public Object login(LoginRequest request, String ipAddress, String userAgent) {
        if (!turnstileService.verify(request.getTurnstileToken(), ipAddress)) {
            throw new BadRequestException("CAPTCHA verification failed. Please try again.");
        }
        // An unresolvable username/email is deliberately never recorded -
        // login_history.user_id is NOT NULL, so there's no real account to
        // attach a row to, and "login history" is inherently per-account.
        User user = userRepository.findByUsername(request.getUsernameOrEmail())
                .orElseGet(() -> userRepository.findByEmail(request.getUsernameOrEmail())
                        .orElseThrow(() -> new UnauthorizedException("Invalid username/email or password")));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            loginHistoryRecorder.recordBestEffort(user, ipAddress, userAgent, "FAILED");
            throw new UnauthorizedException("Invalid username/email or password");
        }

        if (!Boolean.TRUE.equals(user.getEnabled())) {
            loginHistoryRecorder.recordBestEffort(user, ipAddress, userAgent, "FAILED");
            throw new ForbiddenException("This account has been disabled.");
        }

        if (Boolean.TRUE.equals(user.getMfaEnabled())) {
            // Not logged yet - the login isn't complete until verifyMfa()
            // succeeds, which is where the eventual SUCCESS/FAILED is recorded.
            String challengeToken = UUID.randomUUID().toString();
            MfaChallenge challenge = new MfaChallenge(null, user, challengeToken,
                    Instant.now().plus(MFA_CHALLENGE_TTL_MINUTES, ChronoUnit.MINUTES));
            mfaChallengeRepository.save(challenge);
            return new MfaChallengeResponse(challengeToken, "Enter your 6-digit authenticator code");
        }

        loginHistoryRecorder.recordBestEffort(user, ipAddress, userAgent, "SUCCESS");
        return generateTokensForUser(user);
    }

    @Override
    @Transactional
    public AuthResponse verifyMfa(MfaVerifyRequest request, String ipAddress, String userAgent) {
        MfaChallenge challenge = mfaChallengeRepository.findByChallengeToken(request.getChallengeToken())
                .orElseThrow(() -> new UnauthorizedException("Invalid or expired challenge"));

        if (challenge.getExpiresAt().isBefore(Instant.now())) {
            mfaChallengeRepository.delete(challenge);
            throw new UnauthorizedException("Challenge expired, please log in again");
        }

        User user = challenge.getUser();
        if (!Boolean.TRUE.equals(user.getEnabled())) {
            // The account could have been disabled by an admin after this
            // challenge was created but before it was completed - the same
            // check login() already does must also apply here, otherwise a
            // still-valid challenge would let a disabled account complete
            // login and mint fresh tokens anyway.
            mfaChallengeRepository.delete(challenge);
            throw new ForbiddenException("This account has been disabled.");
        }

        if (StringUtils.hasText(request.getCode()) && StringUtils.hasText(request.getRecoveryCode())) {
            throw new BadRequestException("Provide either a code or a recovery code, not both.");
        }

        boolean verified;
        if (StringUtils.hasText(request.getCode())) {
            String decryptedSecret = totpEncryptionService.decrypt(user.getTotpSecret());
            verified = totpService.verify(decryptedSecret, request.getCode());
        } else if (StringUtils.hasText(request.getRecoveryCode())) {
            verified = consumeRecoveryCode(user, request.getRecoveryCode());
        } else {
            verified = false;
        }

        if (!verified) {
            loginHistoryRecorder.recordBestEffort(user, ipAddress, userAgent, "FAILED");
            throw new UnauthorizedException("Invalid verification code");
        }

        // Atomic delete-and-check (not delete(challenge)) - see
        // MfaChallengeRepository.deleteByChallengeToken()'s comment. Two
        // concurrent /mfa/verify calls with the same challengeToken and a
        // correct code could both reach here; only the one that actually
        // deletes a row is allowed to mint a session.
        if (mfaChallengeRepository.deleteByChallengeToken(challenge.getChallengeToken()) == 0) {
            throw new UnauthorizedException("Challenge was already used. Please login again");
        }
        loginHistoryRecorder.recordBestEffort(user, ipAddress, userAgent, "SUCCESS");
        return generateTokensForUser(user);
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<LoginHistoryResponse> getLoginHistory(Long userId, Pageable pageable) {
        Page<LoginHistory> page = loginHistoryRepository.findByUser_IdOrderByLoginTimeDesc(userId, pageable);
        return new PagedResponse<>(
                page.getContent().stream()
                        .map(h -> new LoginHistoryResponse(h.getId(), h.getLoginTime(), h.getIpAddress(), h.getUserAgent(), h.getStatus()))
                        .toList(),
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
    public MfaSetupResponse setupMfa(Long userId) {
        User user = getUserOrThrow(userId);
        if (Boolean.TRUE.equals(user.getMfaEnabled())) {
            // Without this guard, a stray re-call (double-submit, stale "Set up
            // 2FA" page reload) would silently overwrite the working secret
            // without ever disabling MFA - locking the user out exactly like
            // losing their authenticator device would, since the old secret
            // their app is still configured with would stop matching.
            throw new BadRequestException("MFA is already enabled. Disable it first to re-enroll.");
        }
        String secret = totpService.generateSecret();
        user.setTotpSecret(totpEncryptionService.encrypt(secret));
        userRepository.save(user);

        String uri = totpService.buildOtpAuthUri(user.getEmail(), secret);
        return new MfaSetupResponse(secret, uri);
    }

    @Override
    @Transactional
    public MfaEnableResponse enableMfa(Long userId, MfaEnableRequest request) {
        User user = getUserOrThrow(userId);
        if (user.getTotpSecret() == null) {
            throw new BadRequestException("Call /mfa/setup first");
        }

        String decryptedSecret = totpEncryptionService.decrypt(user.getTotpSecret());
        if (!totpService.verify(decryptedSecret, request.getCode())) {
            throw new BadRequestException("Invalid verification code");
        }

        user.setMfaEnabled(true);
        userRepository.save(user);

        mfaRecoveryCodeRepository.deleteByUser(user);
        List<String> plainCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
        plainCodes.forEach(code ->
                mfaRecoveryCodeRepository.save(new MfaRecoveryCode(null, user, passwordEncoder.encode(code))));

        notifyAccountEventBestEffort(user, "Two-factor authentication was enabled on your account.");
        return new MfaEnableResponse(true, plainCodes);
    }

    @Override
    @Transactional
    public void disableMfa(Long userId, MfaDisableRequest request) {
        User user = getUserOrThrow(userId);
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new UnauthorizedException("Invalid password");
        }
        if (!Boolean.TRUE.equals(user.getMfaEnabled())) {
            throw new BadRequestException("MFA is not enabled");
        }

        // A recovery code is accepted here too, same either/or shape as
        // verifyMfa() - a user who already fell back to a recovery code to log
        // in (lost their authenticator device) would otherwise have no way to
        // ever disable MFA. The password check above still applies either way;
        // the recovery code only replaces the TOTP-code verification.
        if (StringUtils.hasText(request.getCode()) && StringUtils.hasText(request.getRecoveryCode())) {
            throw new BadRequestException("Provide either a code or a recovery code, not both.");
        }

        boolean verified;
        if (StringUtils.hasText(request.getCode())) {
            String decryptedSecret = totpEncryptionService.decrypt(user.getTotpSecret());
            verified = totpService.verify(decryptedSecret, request.getCode());
        } else if (StringUtils.hasText(request.getRecoveryCode())) {
            verified = consumeRecoveryCode(user, request.getRecoveryCode());
        } else {
            verified = false;
        }

        if (!verified) {
            throw new UnauthorizedException("Invalid verification code");
        }

        user.setMfaEnabled(false);
        user.setTotpSecret(null);
        userRepository.save(user);
        mfaRecoveryCodeRepository.deleteByUser(user);
        mfaChallengeRepository.deleteByUser(user);
        notifyAccountEventBestEffort(user, "Two-factor authentication was disabled on your account.");
    }

    @Override
    @Transactional(readOnly = true)
    public MfaStatusResponse getMfaStatus(Long userId) {
        User user = getUserOrThrow(userId);
        return new MfaStatusResponse(Boolean.TRUE.equals(user.getMfaEnabled()));
    }

    @Override
    @Transactional
    public void changePassword(Long userId, ChangePasswordRequest request) {
        User user = getUserOrThrow(userId);
        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            throw new UnauthorizedException("Current password is incorrect");
        }
        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
        // Force re-login everywhere else - a stolen-device session shouldn't
        // survive a password change made because of suspected compromise.
        refreshTokenRepository.deleteByUser(user);
        notifyAccountEventBestEffort(user, "Your password was changed.");
    }

    @Override
    @Transactional
    public void forgotPassword(ForgotPasswordRequest request) {
        Optional<User> maybeUser = userRepository.findByEmail(request.getEmail());
        if (maybeUser.isEmpty()) {
            // Don't reveal whether the email is registered - the controller
            // returns the same generic response either way.
            return;
        }
        User user = maybeUser.get();
        // Everything past this point (invalidating the old code, generating
        // and persisting a new one, sending the email) runs off-thread, same
        // as sendPasswordResetEmailBestEffort's own network call - the two
        // DB writes here (delete + insert) were themselves a smaller but
        // still measurable timing side-channel even after that first fix,
        // since the unregistered-email branch above does neither of them.
        notificationExecutor.execute(() -> {
            // Only the most recently requested code is ever valid.
            passwordResetTokenRepository.deleteByUser(user);
            String code = randomPasswordResetCode();
            PasswordResetToken token = new PasswordResetToken(null, user, code,
                    Instant.now().plus(PASSWORD_RESET_TTL_MINUTES, ChronoUnit.MINUTES));
            passwordResetTokenRepository.save(token);
            sendPasswordResetEmailBestEffort(user, code);
        });
    }

    @Override
    @Transactional
    public void resetPassword(ResetPasswordRequest request) {
        PasswordResetToken token = passwordResetTokenRepository.findByResetCode(request.getResetCode())
                .orElseThrow(() -> new UnauthorizedException("Invalid or expired reset code"));

        if (token.getExpiresAt().isBefore(Instant.now())) {
            passwordResetTokenRepository.delete(token);
            throw new UnauthorizedException("Reset code expired, please request a new one");
        }

        User user = token.getUser();
        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
        // Force re-login everywhere - same reasoning as changePassword: a
        // compromised-credential recovery path shouldn't leave old sessions alive.
        refreshTokenRepository.deleteByUser(user);
        passwordResetTokenRepository.delete(token);
        notifyAccountEventBestEffort(user, "Your password was reset.");
    }

    // Unlike sendWelcomeEmailBestEffort (which forwards the freshly-registered
    // user's own token), there's no logged-in user's token to forward here -
    // the caller is by definition logged out. Mints a short-lived, synthetic
    // internal token purely to authenticate this one server-to-server call -
    // common-library's JwtAuthenticationFilter only validates the signature
    // and reads claims, it never checks the user exists, so this passes
    // cleanly with no new auth mechanism and no endpoint made public.
    private void sendPasswordResetEmailBestEffort(User user, String code) {
        notificationExecutor.execute(() -> {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + mintSystemToken());
                Map<String, String> body = Map.of(
                        "to", user.getEmail(),
                        "subject", "Reset your Mindora password",
                        "body", "Hi " + user.getUsername() + ",\n\nYour password reset code is: " + code +
                                "\n\nThis code expires in " + PASSWORD_RESET_TTL_MINUTES + " minutes. " +
                                "If you didn't request this, you can safely ignore this email."
                );
                restTemplate.postForEntity(notificationServiceUrl + "/api/v1/notifications/send-email",
                        new HttpEntity<>(body, headers), Void.class);
            } catch (Exception e) {
                log.warn("Could not send password reset email to {}: {}", user.getEmail(), e.getMessage());
            }
        });
    }

    // Best-effort account-security notification, logged via notification-service's
    // real notification feed (not email) - reuses the same system-token
    // authentication as the email sends above. Fire-and-forget: never allowed
    // to fail the real operation (password change, MFA toggle, etc.) that
    // triggered it, and running off-thread via notificationExecutor keeps
    // this consistent with the timing-side-channel fix on the password-reset
    // path even though this particular call site isn't enumeration-sensitive.
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

    private String randomPasswordResetCode() {
        // Same generation shape as randomRecoveryCode() - human-typeable,
        // unambiguous charset. A separate method (not a shared rename) matches
        // this codebase's established tolerance for small, purpose-named
        // duplicates over premature abstraction.
        StringBuilder sb = new StringBuilder(11);
        String chars = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no O/I to avoid ambiguity
        for (int i = 0; i < 10; i++) {
            if (i == 5) sb.append('-');
            sb.append(chars.charAt(RECOVERY_CODE_RANDOM.nextInt(chars.length())));
        }
        return sb.toString();
    }

    @Override
    @Transactional(readOnly = true)
    public CurrentUserResponse getCurrentUser(Long userId) {
        User user = getUserOrThrow(userId);
        List<String> roleNames = user.getRoles().stream().map(r -> r.getName().name()).toList();
        return new CurrentUserResponse(user.getId(), user.getUsername(), user.getEmail(), user.getFullName(), roleNames,
                Boolean.TRUE.equals(user.getEmailVerified()));
    }

    @Override
    @Transactional
    public AuthResponse refreshToken(RefreshTokenRequest request) {
        RefreshToken token = refreshTokenRepository.findByToken(request.getRefreshToken())
                .orElseThrow(() -> new UnauthorizedException("Invalid refresh token"));

        if (Boolean.TRUE.equals(token.getRevoked()) || token.getExpiryDate().isBefore(Instant.now())) {
            refreshTokenRepository.delete(token);
            throw new UnauthorizedException("Refresh token was expired or revoked. Please login again");
        }

        User user = token.getUser();
        if (!Boolean.TRUE.equals(user.getEnabled())) {
            // A refresh token issued before the account was disabled must
            // stop working immediately - otherwise disabling an account
            // wouldn't actually revoke access for as long as the token's
            // 7-day lifetime, defeating AdminServiceImpl.updateStatus's
            // whole point.
            refreshTokenRepository.delete(token);
            throw new ForbiddenException("This account has been disabled.");
        }
        // Atomic delete-and-check (not delete(token)) - see
        // RefreshTokenRepository.deleteByToken()'s comment. Two concurrent
        // /refresh calls with the same token could both reach here having
        // passed the checks above; only the one that actually deletes a row
        // (count 1) is allowed to mint a session. The loser (count 0) means
        // another request already rotated this token first.
        if (refreshTokenRepository.deleteByToken(token.getToken()) == 0) {
            throw new UnauthorizedException("Refresh token was already used. Please login again");
        }
        return generateTokensForUser(user);
    }

    @Override
    @Transactional
    public void logout(String refreshToken) {
        refreshTokenRepository.findByToken(refreshToken).ifPresent(refreshTokenRepository::delete);
    }

    private User getUserOrThrow(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
    }

    private boolean consumeRecoveryCode(User user, String rawCode) {
        List<MfaRecoveryCode> unusedCodes = mfaRecoveryCodeRepository.findByUserAndUsedFalse(user);
        for (MfaRecoveryCode recoveryCode : unusedCodes) {
            if (passwordEncoder.matches(rawCode, recoveryCode.getCodeHash())) {
                recoveryCode.setUsed(true);
                recoveryCode.setUsedAt(Instant.now());
                mfaRecoveryCodeRepository.save(recoveryCode);
                return true;
            }
        }
        return false;
    }

    private List<String> generateRecoveryCodes(int count) {
        List<String> codes = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            codes.add(randomRecoveryCode());
        }
        return codes;
    }

    private String randomRecoveryCode() {
        // 10 random hex digits, formatted as XXXXX-XXXXX for readability.
        StringBuilder sb = new StringBuilder(11);
        String chars = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no O/I to avoid ambiguity
        for (int i = 0; i < 10; i++) {
            if (i == 5) sb.append('-');
            sb.append(chars.charAt(RECOVERY_CODE_RANDOM.nextInt(chars.length())));
        }
        return sb.toString();
    }

    private AuthResponse generateTokensForUser(User user) {
        List<String> roleNames = user.getRoles().stream()
                .map(r -> r.getName().name())
                .toList();

        SecretKey key = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
        Instant now = Instant.now();
        Instant expiryDate = now.plusMillis(jwtExpirationMs);

        String accessToken = Jwts.builder()
                .subject(user.getUsername())
                .claim("userId", user.getId())
                .claim("email", user.getEmail())
                .claim("roles", roleNames)
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiryDate))
                .signWith(key)
                .compact();

        String refreshTokenValue = UUID.randomUUID().toString();
        RefreshToken refreshToken = new RefreshToken(
                null,
                refreshTokenValue,
                user,
                Instant.now().plusMillis(refreshExpirationMs),
                false);
        refreshTokenRepository.save(refreshToken);

        return new AuthResponse(
                accessToken,
                refreshTokenValue,
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                roleNames);
    }
}
