# Enterprise Upgrade Roadmap: Digital Signage Dashboard

This document outlines the technical requirements and implementation strategy to upgrade the Digital Signage Dashboard from a development MVP to a telecom-grade, high-availability enterprise platform.

---

## 1. Core Architecture Migration

### 1.1 Database: SQLite → PostgreSQL
*   **Rationale**: SQLite lacks the concurrency and high availability required for large-scale device fleets.
*   **Solution**:
    *   Migrate `prisma/schema.prisma` provider to `postgresql`.
    *   Implement connection pooling using **PgBouncer**.
    *   Set up a Read-Replica for the Analytics dashboard to avoid performance degradation on the primary write node.

### 1.2 Storage: Local → S3 + CDN
*   **Rationale**: Local disk storage is a single point of failure and doesn't scale across multiple app servers.
*   **Solution**:
    *   Implement `S3Service` using `@aws-sdk/client-s3`.
    *   Update `Media` routes to upload to a private S3 bucket.
    *   Serve media files via **CloudFront** (or similar CDN) with **Signed URLs** for security.

### 1.3 Real-time Scaling: Redis Adapter
*   **Rationale**: Current Socket.io implementation is limited to a single server instance.
*   **Solution**:
    *   Integrate `@socket.io/redis-adapter` and `ioredis`.
    *   This allows events like `PLAY_OVERRIDE` to propagate across multiple backend instances behind a load balancer.

---

## 2. Security Hardening

### 2.1 Secure Device Handshake (Pairing)
*   **Rationale**: Current registration relies on manual `deviceId` entry, which is easily spoofed.
*   **Solution**:
    *   **New Flow**: 
        1. TV Player displays a unique 6-digit **Pairing Code**.
        2. Admin enters this code in the Web CMS.
        3. Server validates the code and issues a secure **Device JWT** (stored in TV Player's `localStorage`).
    *   All subsequent requests from the TV (Heartbeat, Schedule, Playback) must include this JWT.

### 2.2 System-wide Audit Logging
*   **Rationale**: Telecom compliance requires tracking all administrative changes.
*   **Solution**:
    *   Create a `AuditLog` table in Prisma:
        ```prisma
        model AuditLog {
          id        String   @id @default(uuid())
          userId    String
          action    String   // e.g., "DELETE_USER", "CREATE_SCHEDULE"
          target    String   // e.g., "Media:123"
          changes   Json?    // Before/After snapshot
          ipAddress String?
          timestamp DateTime @default(now())
        }
        ```
    *   Implement a global middleware or service to intercept and log sensitive mutations.

### 2.3 Identity Integration (SSO)
*   **Rationale**: Corporate users prefer central credential management.
*   **Solution**:
    *   Implement **Passport.js** strategies for SAML or OAuth2 (Active Directory/LDAP).

---

## 3. Reliability & Monitoring

### 3.1 Device Telemetry & Remote Management
*   **Rationale**: Manual troubleshooting of remote screens is expensive.
*   **Solution**:
    *   **Remote Screenshot**: CMS sends a `TAKE_SCREENSHOT` event; TV Player captures `<canvas>` or video frame and uploads it back via multipart POST.
    *   **Hardware Metrics**: Heartbeat should include:
        *   Free storage space.
        *   Memory usage.
        *   Current player version.
        *   App uptime.

### 3.2 Predictive Pre-caching
*   **Rationale**: Streaming 4K video or large assets on the fly causes playback stuttering on poor networks.
*   **Solution**:
    *   TV Player logic update: Fetch the full 24-hour schedule.
    *   Identify all `mediaId`s.
    *   Download all assets to the **Cache API** *immediately* after scheduling changes.
    *   Play *only* from the local cache to ensure 0ms buffer times.

---

## 4. Performance & DX

### 4.1 Backend Performance
*   **Rate Limiting**: Add `express-rate-limit` to all public `/api/devices` endpoints.
*   **Clustering**: Use `pm2` or Node's `cluster` module to utilize all CPU cores.
*   **Structured Logging**: Replace `console.log` with **Winston** or **Pino** for JSON logs compatible with Datadog/ELK.

### 4.2 Automated Testing Suite
*   **Unit Tests**: Jest for utility functions and route logic.
*   **E2E Tests**: Playwright scripts to simulate:
    1. Admin uploads media.
    2. Admin schedules media.
    3. Virtual TV Player receives event and starts playback.

---

## 5. Deployment Manifests
*   Provide `Dockerfile` for Backend and Web CMS.
*   Provide `docker-compose.yml` for local production simulation.
*   Provide Helm Charts for Kubernetes deployment in telecom private clouds.
