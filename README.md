# Content Fetcher Service

A NestJS service that fetches content from HTTP URLs in batches. Submit a list of URLs as a **job**, and retrieve the results (preview + metadata) or the **full stored content** for a specific URL.

## How to run

### Prerequisites

- Node.js 22+
- pnpm
- Docker (for MongoDB)

### 1) Start MongoDB

```bash
docker compose up -d
```

### 2) Configure environment (optional)

Create a `.env` file (loaded automatically at startup via `dotenv`):

```bash
PORT=3000
MONGO_URI=mongodb://localhost:27017/content-fetcher
```

If you don't set `PORT`, it defaults to `3000`.

### 3) Install dependencies

```bash
pnpm install
```

### 4) Run the service

```bash
pnpm run dev
```

### Swagger

Visit `http://localhost:<PORT>/api` for interactive API docs.

## Features

- **Batch URL fetching (jobs)** with configurable concurrency
- **Redirect handling** with chain tracking and max redirects
- **Content size limits** with preview generation
- **MongoDB persistence** for job results and full content
- **SSRF mitigation** via `hostsBlacklist` (blocks `localhost` variants by default)
- **Swagger API documentation**
- **Input validation** with `class-validator`

## API Endpoints

### Create a Job

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://example.com", "https://httpbin.org/get"]}'
```

Response:
```json
{"jobId": "507f1f77bcf86cd799439011"}
```

### Get Job Results

```bash
curl http://localhost:3000/jobs/<jobId>
```

Response:
```json
{
  "jobId": "507f1f77bcf86cd799439011",
  "status": "completed",
  "createdAt": "2026-01-09T12:00:00.000Z",
  "updatedAt": "2026-01-09T12:00:01.000Z",
  "results": [
    {
      "url": "https://example.com",
      "urlHash": "abc123...",
      "status": "success",
      "httpStatus": 200,
      "contentType": "text/html",
      "byteLength": 1256,
      "truncated": false,
      "contentPreview": "<!doctype html>..."
    }
  ]
}
```

### Get Full Result for a URL

```bash
curl http://localhost:3000/jobs/<jobId>/urls/<urlHash>
```

Response includes the full `content` field.

## Configuration

Configuration is provided by `ConfigModule` as an injectable `AppConfig` object.

You can override values using environment variables (optionally via `.env`):

| Option | Default | Description |
|--------|---------|-------------|
| `mongoUri` | `mongodb://localhost:27017/content-fetcher` | MongoDB connection string |
| `port` | `3000` | Server listen port |
| `maxUrlsPerJob` | 20 | Maximum URLs per job |
| `concurrency` | 5 | Parallel fetch limit |
| `mongoBatchTimeMs` | 250 | Batch window for Mongo updates (JobRunner) |
| `mongoBatchSize` | 10 | Batch size for Mongo updates (JobRunner) |
| `timeoutMs` | 10000 | Per-URL timeout |
| `maxRedirects` | 5 | Maximum redirect hops |
| `maxBytes` | `10485760` (10MB) | Maximum response body size in bytes (numeric value only, e.g., `10485760` for 10MB) |
| `previewChars` | 500 | Content preview length |
| `hostsBlacklist` | localhost variants | Blocks hosts like `localhost`, `127.0.0.1`, `::1` |

## Running Tests

```bash
# Unit tests
pnpm run test

# Integration tests (JobsController) use testcontainers (requires Docker)
pnpm run test --runInBand

# Test coverage
pnpm run test:cov
```

## Architecture

- **Controller layer**: HTTP request/response handling only
- **Service layer**: Business logic and orchestration
- **Repository layer**: Database access abstraction
- **Fetcher service**: HTTP client with redirect/timeout handling

## Design Decisions & Trade-offs

* **In-Memory Processing:** 
    * **Decision:** I implemented a custom in-memory job runner with configurable concurrency instead of using a persistent queue like BullMQ/Redis.
    * **Trade-off:** In a production environment, I would swap this for a persistent queue to handle process crashes and retries.

* **Split Collections (Jobs vs. JobContents):**
    * **Decision:** Job metadata and Fetch Results are stored in separate MongoDB collections (linked by `jobId`).
    * **Reasoning:** This is because of MongoDB's **16MB BSON document limit**. I used MongoDB for the storage here to avoid over engineering for the small scope of the project, and enforced a 10MB storage limit. This can be swapped out for blob storage in the future.

* **Streaming & Truncation:**
    * **Decision:** The fetcher uses Node.js streams to read the response body, enforcing a hard byte limit (default 10MB).
    * **Reasoning:** This prevents out of memory vulnerabilities. If a payload exceeds the limit, it is truncated (preserving headers/metadata) rather than failed, ensuring the user still gets partial utility.

* **Manual Redirect Handling:**
    * **Decision:** Redirects are followed manually rather than relying on the HTTP client's auto-follow.
    * **Reasoning:** This allows the `hostsBlacklist` security check to run on every hop of the chain, preventing SSRF attacks via open redirects to internal/blocked hosts. This logic can be expanded upon in url-validator for stricter protection in the future.