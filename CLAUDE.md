# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A January 2025 fitness challenge tracker comparing Matt Phippen vs Scott Olsen's Strava stats. Static site hosted on GitHub Pages that auto-updates via GitHub Actions.

## Commands

- `npm run scrape` - Run the Playwright scraper to fetch current stats from Strava (requires `npm ci` and `npx playwright install chromium` first)

## Architecture

**Data Flow:**
1. GitHub Actions runs `scripts/scrape.js` hourly via Playwright to scrape public Strava athlete pages
2. Stats are written to `data.json` and auto-committed
3. `index.html` fetches `data.json` on load and renders the comparison

**Key Files:**
- `index.html` - Single-page app with embedded CSS/JS, loads data.json client-side
- `data.json` - Current stats (distance, movingTime, profilePic) for each contestant
- `scripts/scrape.js` - Playwright scraper that extracts "Current Month" stats from Strava athlete profiles
- `images/` - Profile pictures (matt.jpg, scott.jpg)

**Strava Athlete IDs:**
- Matt: 2844018
- Scott: 736553

## Notes

- **Always commit `.claude/` directory changes** (including `settings.local.json`) alongside other changes
- **Update this CLAUDE.md file** with every commit if there are relevant changes or additions (new commands, architecture changes, etc.)
- The scraper runs on GitHub Actions; local runs require Playwright installation
