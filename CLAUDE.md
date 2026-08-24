# CLAUDE.md

Repo-specific context for Claude Code (or any agent/contributor) working in this codebase. See [README.md](README.md) for setup/run instructions and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full service/dependency tables - this file is about *gotchas*, not architecture restated.

## What this is

A 12-module Maven multi-module Spring Boot monorepo (`common-library` + 11 deployable services) behind a Spring Cloud Gateway, plus a Python Flask AI microservice and a React 19/TypeScript frontend. Java 21, Spring Boot 3.3.2, Spring Cloud 2023.0.3. (`config-server` was removed - it was never actually imported by any service, just an idle Spring Cloud Config server consuming RAM and delaying gateway startup via `depends_on`.)

## The one thing worth internalizing before touching anything

**A feature looking done does not mean the backend behind it is real.** This has been true repeatedly, not once: `search-service` was fully mocked (hardcoded single result) despite a real Elasticsearch cluster sitting unused behind it; `ai-service`'s Rephrase/Fix Grammar endpoints 404'd for months because the buttons called paths with no `@PostMapping`, silently swallowed by a try/catch; the RabbitMQ journal→search pipeline was completely disconnected because the consumer's queue name didn't match the producer's; the dashboard's "Journaling Streak" widget showed total entry count, not a streak; and this project's own docs claimed Redis-backed refresh-token rotation, AES-256 content encryption, and enforced RBAC that none of the code actually implements (fixed in the docs phase, see git history on `docs/architecture-and-api-guides`). **Before building on top of something, grep for the real implementation. Don't trust a doc, a variable name, or a UI element's presence.**

## Workflow

One branch per phase/unit of work, cut from `main`, one commit per logical concern within it (`type(scope): summary`). See [CONTRIBUTING.md](CONTRIBUTING.md). No `gh` CLI/token access in this environment - branches get pushed, PRs are created and merged manually by the maintainer through the GitHub UI.

## Known inconsistencies (intentional-but-surprising, not bugs to silently "fix")

- **`X-User-Id` handling is inconsistent across services.** `user-service`, `recommendation-service`, `notification-service`, `analytics-service`, `file-service` require the header (`@RequestHeader("X-User-Id") Long userId`, 400s if absent). `journal-service` and `search-service` make it optional and silently default to `userId = 1L`, in both the controller *and* the service layer independently. If you're touching either of those two services, don't assume the header is always present.
- **`Journal.mood` has two layers of defaulting that can mask each other.** The entity's field initializer already sets `mood = "NEUTRAL"`, so `JournalServiceImpl.createJournal`'s `if (journal.getMood() == null) journal.setMood("HAPPY")` branch only actually fires when a caller explicitly sends `"mood": null` in the JSON body - a plain `new Journal()` or a request that just omits the `mood` key never triggers it. Found while writing `JournalServiceTest` in the backend-test-coverage phase; a test that assumes "unset" means "null" here will silently pass for the wrong reason.

## Testing conventions (see `docs/` READMEs and any `*Test.java` for examples)

JUnit 5 + `MockitoExtension`, `@Mock`/`@InjectMocks` on the `*Impl` class (not the interface), `ReflectionTestUtils` for `@Value`-injected fields, `ArgumentCaptor` for asserting saved/published state, `methodUnderTest_Scenario_ExpectedOutcome` naming, flat test classes (no `@Nested`). Controller tests construct the controller directly with a mocked service and call methods like a plain object - no `@WebMvcTest`/`MockMvc`, that's not an established pattern here. `journal-service`, `user-service`, and `search-service` have Testcontainers-backed integration tests (real MySQL/RabbitMQ) for the data/broker-touching layers - these need a working Docker daemon reachable from the JVM, which is **not guaranteed inside every sandboxed agent environment**: `docker ps`/`docker version` working via the CLI does not mean Testcontainers' Java client can reach the same daemon - a Docker Desktop proxy pipe can accept plain CLI calls while returning empty/400 responses to the raw Engine API calls Testcontainers needs. If those specific tests fail with a `DockerClientProviderStrategy`/`ContainerFetchException` error, that's very likely the sandbox, not the test - verify in real CI or on a normal machine before assuming the test is wrong.

## Branch status (check `git log --all --oneline` / `git branch -a` for current truth - this rots fast)

All phases through the most recent bug-hunt pass are merged to `main`, including real TOTP 2FA (`auth-service`'s MFA/password-change/`/me` endpoints, `common-library`'s `JwtAuthenticationFilter.additionalPublicPaths`) and the full per-service K8s manifest set under `k8s/`. Don't assume this list stays current for long - re-check `git log --all --oneline` before relying on it.

## Git commit attribution rules

- NEVER add a `Co-Authored-By:` trailer to any Git commit.
- NEVER add `Co-Authored-By: Claude`, `Co-Authored-By: Claude Code`, `Co-Authored-By: Claude Sonnet`, `Co-Authored-By: Anthropic`, or any other AI/Anthropic attribution to commit messages.
- Do not identify Claude, Claude Code, Anthropic, or any AI system as a commit author or co-author.
- Preserve the repository owner's existing Git identity (`user.name` and `user.email`).
- NEVER modify `git config user.name` or `git config user.email` unless the maintainer explicitly asks you to.
- Before creating a commit, verify that the commit message contains no `Co-Authored-By:` trailer referring to Claude, Anthropic, or any AI system.
- If an automatically generated AI attribution appears in the commit message, remove it before committing.
- Follow the existing repository commit convention: `type(scope): summary`.