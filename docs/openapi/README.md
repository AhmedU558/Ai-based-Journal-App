# Static OpenAPI specs

A committed, versioned snapshot of each service's live OpenAPI 3 spec - complements the always-up-to-date but not-diffable live specs each service serves at `/v3/api-docs` (and renders at `/swagger-ui.html`) while running.

Captured 2026-08-14 from a locally running `docker compose` stack on `main` (commit right after the Postman collection dedup). `gateway-service` and `discovery-server` are excluded - the first is a pure routing proxy with no `springdoc-openapi` dependency of its own, and the latter is an unmodified Eureka server with no custom endpoints to document. (`config-server` was excluded for the same reason at capture time and has since been removed from the platform entirely - it was never actually imported by any service.)

## Regenerating

With the full stack up (`docker compose up -d --build`) and every service healthy:

```bash
for svc_port in "auth-service:8081" "user-service:8082" "journal-service:8083" "ai-service:8084" \
                "search-service:8085" "recommendation-service:8086" "notification-service:8087" \
                "analytics-service:8088" "file-service:8089"; do
  svc="${svc_port%%:*}"
  port="${svc_port##*:}"
  curl -s "http://localhost:${port}/v3/api-docs" | python3 -m json.tool > "docs/openapi/${svc}.openapi.json"
done
```

These files are not wired into CI and will drift from the real live spec as the code evolves - re-run the above and commit the diff whenever the API surface changes meaningfully, the same way `docs/ai-journal-platform.postman_collection.json` needs a manual refresh. For anything that must always be current, prefer the live `/v3/api-docs`/`/swagger-ui.html` endpoints over these files.
