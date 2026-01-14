# Content Fetcher Service

A NestJS service that fetches content from HTTP URLs in batches. Submit a list of URLs as a **job**, and retrieve the results (preview + metadata) or the **full stored content** for a specific URL.

## How to run

### Prerequisites

- Node.js 18+
- pnpm
- Docker (for MongoDB)

### 1) Start MongoDB

```bash
docker compose up -d
```

### 2) Configure environment (optional)

Create a `.env` file (loaded automatically at startup via `dotenv`):

```bash
PORT=5000
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
- **RxJS-based job runner** with buffered Mongo updates

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

### Get Full Content for a URL

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
| `maxUrlsPerJob` | 10 | Maximum URLs per job |
| `concurrency` | 5 | Parallel fetch limit |
| `mongoBatchTimeMs` | 250 | Batch window for Mongo updates (JobRunner) |
| `mongoBatchSize` | 10 | Batch size for Mongo updates (JobRunner) |
| `timeoutMs` | 10000 | Per-URL timeout |
| `maxRedirects` | 5 | Maximum redirect hops |
| `maxBytes` | 1MB | Maximum response body size |
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

## Project Structure

```
src/
├── config/                # ConfigModule + AppConfig token
├── main.ts                # Application bootstrap
├── app.module.ts          # Root module
└── jobs/
    ├── jobs.module.ts     # Jobs feature module
    ├── jobs.controller.ts # HTTP endpoints
    ├── jobs.service.ts    # Business logic orchestration
    ├── job-runner.service.ts   # Async job execution
    ├── url-fetcher.service.ts  # HTTP fetching with redirects
    ├── jobs.repository.ts      # MongoDB data access
    ├── job.schema.ts           # Mongoose schema
    ├── dto/                    # Request/Response DTOs
    └── utils/                  # Pure utility functions
```

## Architecture

- **Controller layer**: HTTP request/response handling only
- **Service layer**: Business logic and orchestration
- **Repository layer**: Database access abstraction
- **Fetcher service**: HTTP client with redirect/timeout handling

Follows SOLID principles with clean separation of concerns.
