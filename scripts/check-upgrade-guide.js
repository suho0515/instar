#!/usr/bin/env node
/**
 * Pre-publish upgrade guide check + finalization.
 *
 * Every release must ship with an upgrade guide so agents understand
 * what changed and can relay meaningful context to users.
 *
 * This script does TWO things:
 *   1. VALIDATES the guide exists, is well-formed, and has required sections
 *   2. FINALIZES the guide by renaming NEXT.md → {version}.md
 *      (the "CI rename step" that was previously missing)
 *
 * After finalization, a fresh NEXT.md template is created so the NEXT
 * publish is blocked until new content is written.
 *
 * Workflow:
 *   1. Developer writes `upgrades/NEXT.md` alongside code changes
 *   2. Version is bumped in package.json
 *   3. `npm publish` triggers `prepublishOnly` which runs this script
 *   4. Script validates NEXT.md → renames to {version}.md → creates template
 *   5. Published package contains the versioned guide
 *   6. Agent's UpgradeGuideProcessor finds the versioned file and delivers it
 *   7. UpgradeNotifyManager spawns a session to notify the user
 *
 * Required sections in every guide:
 *   - "## What Changed" — technical description for the agent
 *   - "## What to Tell Your User" — user-facing narrative the agent relays
 *   - "## Summary of New Capabilities" — concise list for MEMORY.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const version = pkg.version;
const guidePath = path.join(ROOT, 'upgrades', `${version}.md`);
const nextPath = path.join(ROOT, 'upgrades', 'NEXT.md');
const guideExists = fs.existsSync(guidePath);
const nextExists = fs.existsSync(nextPath);

// Required sections for a well-formed guide
const REQUIRED_SECTIONS = [
  '## What Changed',
  '## What to Tell Your User',
  '## Summary of New Capabilities',
];

const MIN_LENGTH = 200;

// Template for a fresh NEXT.md after finalization
const NEXT_TEMPLATE = `# Upgrade Guide — vNEXT

## What Changed

<!-- Describe what changed technically. What new features, APIs, behavioral changes? -->
<!-- Write this for the AGENT — they need to understand the system deeply. -->

## What to Tell Your User

<!-- Write talking points the agent should relay to their user. -->
<!-- This should be warm, conversational, user-facing — not a changelog. -->
<!-- Focus on what THEY can now do, not internal plumbing. -->

- **[Feature name]**: "[Brief, friendly description of what this means for the user]"

## Summary of New Capabilities

| Capability | How to Use |
|-----------|-----------|
| [Capability] | [Endpoint, command, or "automatic"] |
`;

/**
 * Validate a guide file and return any issues found.
 */
function validateGuide(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const issues = [];

  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) {
      issues.push(`missing "${section}" section`);
    }
  }

  if (content.length < MIN_LENGTH) {
    issues.push(`guide is too short (${content.length} chars, minimum ${MIN_LENGTH}) — probably incomplete`);
  }

  // Check for template placeholders that were never filled in
  if (content.includes('<!-- Describe what changed')) {
    issues.push(`"What Changed" section still contains template placeholder — fill it in`);
  }
  if (content.includes('[Feature name]') || content.includes('[Brief, friendly description')) {
    issues.push(`"What to Tell Your User" section still contains template placeholder — fill it in`);
  }
  if (content.includes('[Capability]') && content.includes('[Endpoint, command')) {
    issues.push(`"Summary of New Capabilities" section still contains template placeholder — fill it in`);
  }

  return issues;
}

/**
 * Finalize NEXT.md → {version}.md and create fresh template.
 */
function finalizeGuide() {
  // Rename NEXT.md to versioned file
  fs.renameSync(nextPath, guidePath);
  console.log(`  Finalized: NEXT.md → ${version}.md`);

  // Update the H1 header to include the actual version
  let content = fs.readFileSync(guidePath, 'utf-8');
  content = content.replace(/^# Upgrade Guide — vNEXT$/m, `# Upgrade Guide — v${version}`);
  fs.writeFileSync(guidePath, content);

  // Create fresh NEXT.md template for the next release
  fs.writeFileSync(nextPath, NEXT_TEMPLATE);
  console.log(`  Created fresh NEXT.md template for next release`);
}

// ── Report ──────────────────────────────────────────────────────────

console.log(`\n  Upgrade Guide Check — v${version}`);
console.log(`  ${'─'.repeat(40)}`);
console.log(`  Guide (${version}.md): ${guideExists ? 'YES' : 'NO'}`);
console.log(`  NEXT.md fallback:     ${nextExists ? 'YES' : 'NO'}`);

// Validate all existing guides (informational — doesn't block)
const upgradesDir = path.join(ROOT, 'upgrades');
let malformedGuides = [];

if (fs.existsSync(upgradesDir)) {
  const guideFiles = fs.readdirSync(upgradesDir).filter(f => f.endsWith('.md') && f !== 'NEXT.md');
  for (const file of guideFiles) {
    const issues = validateGuide(path.join(upgradesDir, file));
    if (issues.length > 0) {
      malformedGuides.push({ file, issues });
    }
  }
}

if (malformedGuides.length > 0) {
  console.log(`\n  Warning: ${malformedGuides.length} existing guide(s) have issues:`);
  for (const { file, issues } of malformedGuides) {
    console.log(`    ${file}: ${issues.join(', ')}`);
  }
}

// ── Enforce ─────────────────────────────────────────────────────────

let exitCode = 0;

if (guideExists) {
  // Version-specific guide already exists (manually created or previously finalized)
  const issues = validateGuide(guidePath);
  if (issues.length > 0) {
    console.log(`\n  ERROR: Guide for v${version} exists but is malformed:`);
    for (const issue of issues) {
      console.log(`    - ${issue}`);
    }
    exitCode = 1;
  } else {
    console.log(`\n  ✓ Upgrade guide validated for v${version}.`);
  }
} else if (nextExists) {
  // NEXT.md exists — validate it, then finalize (rename → version file)
  const issues = validateGuide(nextPath);
  if (issues.length > 0) {
    console.log(`\n  ERROR: NEXT.md exists but is malformed:`);
    for (const issue of issues) {
      console.log(`    - ${issue}`);
    }
    console.log(`\n  Fix the issues above before publishing.`);
    exitCode = 1;
  } else {
    // Validation passed — finalize the guide
    finalizeGuide();
    console.log(`\n  ✓ Upgrade guide finalized and validated for v${version}.`);
    console.log(`  The published package will include upgrades/${version}.md`);
    console.log(`  Agents will receive this guide on their next update.`);
  }
} else {
  // No guide at all — block the publish
  console.log(`\n  ERROR: No upgrade guide found for v${version}.`);
  console.log(`  Every release must include an upgrade guide so agents understand what changed.`);
  console.log(`\n  Create: upgrades/NEXT.md`);
  console.log(`  Required sections:`);
  for (const section of REQUIRED_SECTIONS) {
    console.log(`    - ${section}`);
  }
  console.log(`\n  The guide should tell the story of what changed, how it improves the`);
  console.log(`  user's experience, and what it means for the agent. This is how agents`);
  console.log(`  learn about updates and relay meaningful context to their users.`);
  console.log(`\n  Tip: Write the guide WHILE you're building the feature, not after.`);
  console.log(`  The "What to Tell Your User" section is especially important — it's`);
  console.log(`  the narrative the agent will relay to their human.`);
  exitCode = 1;
}

console.log('');
process.exit(exitCode);
