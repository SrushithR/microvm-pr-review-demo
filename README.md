# MicroVM PR review demo

A deliberately small frontend used to demonstrate isolated pull-request reviews with AWS Lambda MicroVMs, Amazon Bedrock and Playwright.

The `main` branch is the safe baseline: event descriptions are rendered as plain text. The demonstration pull request adds Markdown rendering and intentionally introduces an XSS defect so the review system has a real regression to find.

> **Security demonstration:** feature branches and pull requests may intentionally contain vulnerable code. Do not deploy this repository as a production application.

## Run locally

Requires Node.js 20 or newer.

```bash
npm start
```

Open `http://localhost:8080`.

## Test

```bash
npm test
```
