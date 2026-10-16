# Skill-Gap Admin

Institute dashboard that compares students' GitHub evidence with job requirements,
using Claude to assess skills and polling to detect repository changes.

## Setup

    npm install
    cp .env.example .env        # then fill in your keys
    export $(grep -v '^#' .env | xargs)
    npm start                   # http://localhost:3000

Requires Node 18+.

## Configure students

In `public/index.html`, each student has a `repo` field like `"owner/repo"`.
Set it to a real repository before running "Run AI assessment".

## Notes

- Keep `/api/assess` behind authentication before deploying. Each call spends API quota.
- Authenticity signals prompt human review only. They are not a verdict.
- The event log is in memory and resets on restart.
