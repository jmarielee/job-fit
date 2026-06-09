# Job Fit Report

An honest, accountable job-fit assessment tool. Paste a job description and a
resume, and it returns a scored verdict — where you're strong, where you'd get
cut, and what to fix before applying — pressure-tested by a simulated hiring
committee (recruiter, hiring manager, and an internal skeptic).

## What makes it different

Most "rate my fit" tools ask an LLM for a number. This one doesn't trust the LLM
with the number. The model only *labels* the requirements; a deterministic scoring
engine computes the result. Same labels produce the same score, the same weighting
applies to every candidate, and every label is inspectable — so when it's wrong,
you can see exactly why and fix it, instead of getting a different black-box answer
each run.

## Using it

- **Demo:** click "Load Demo" to see a full sample report — no setup needed.
- **Live:** bring your own Anthropic API key (BYOK). Your key and inputs stay in
  your browser; nothing is stored or sent anywhere except the Anthropic API.

## Status

Active work in progress.
