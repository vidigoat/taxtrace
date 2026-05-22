# TaxTrace

> **Open public spending forensics. Every federal dollar. Every contract. Every connection.**

A TypeScript-everywhere, AI-augmented platform for searching, visualizing, and auditing US federal spending. Combines USAspending, FPDS, SAM.gov, FEC, OpenSecrets, SEC EDGAR, DOGE.gov, and Wikidata into one searchable graph. Detects suspicious patterns automatically. Free, open-source, MIT.

🚧 **Status:** Scaffold in progress. Production target: 4 weeks from 2026-05-22.

## What's broken about today

- [USAspending.gov](https://usaspending.gov) is ugly and slow — search is unusable
- [LittleSis](https://littlesis.org) (the closest existing tool) is manually edited and Rails-era
- [DOGE.gov](https://doge.gov) shows totals but no detail
- [OpenSecrets](https://opensecrets.org) tracks donations but not contracts
- Nothing combines them with AI anomaly detection
- $6.75T federal budget is publicly *recorded* but not publicly *understood*

## What TaxTrace does

1. **Auto-ingests** 10M+ records/day from 10 federal data sources
2. **Builds a graph**: contracts ↔ contractors ↔ executives ↔ donations ↔ politicians ↔ committees
3. **Detects anomalies** automatically: sole-source bids, shell-LLC patterns, suspicious timing, price spikes, network clusters
4. **Renders a 3D network** of any entity's connections (Cytoscape WebGL)
5. **Exposes a public API** anyone can integrate

## Tech stack

100% TypeScript. Bun + Hono backend. Next.js 16 + React 19 frontend. PostgreSQL 17 + Apache AGE (graph in postgres). Drizzle ORM. Polars (nodejs-polars) for ETL. Meilisearch for full-text. Cytoscape.js for 3D viz. shadcn/ui + Tailwind v4. Deployed: Vercel + Railway + Neon.

## Architecture

```
   Data sources (10)
        ↓
   Bun workers (BullMQ)
        ↓
   Polars ETL
        ↓
   PostgreSQL 17 + Apache AGE
        ↓                ↓
   Meilisearch     Hono REST API
                        ↓
                  Next.js 16 frontend
                        ↓
                    Vercel
```

## Status

This README is currently the only deliverable. The scaffold is being built right now.

## License

MIT. See [LICENSE](LICENSE).

## About

Built by [Vidit Patankar](https://github.com/vidigoat) (14, Gurgaon, India) in response to Elon Musk's [May 21, 2026 SpaceXAI hiring tweet](https://x.com/elonmusk/status/...).
