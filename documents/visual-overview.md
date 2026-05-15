# FinPilot Visual Overview

## Purpose

This document defines the recommended visual structure for FinPilot's MVP, including screen count, navigation model, color direction, and layout philosophy. The goal is to ensure the product feels clear, modern, and approachable while keeping the AI assistant central to the experience.

## MVP Screen Count

FinPilot's MVP should consist of **9 screens**:

1. Onboarding / Login
2. Dashboard
3. Add Transaction
4. Transaction History
5. AI Chat Assistant
6. Spending Analysis
7. Savings Goals
8. Reports and Charts
9. Profile / Settings

This screen set covers the full MVP without unnecessary expansion. Larger features such as bank syncing, web-based price comparison, and deeper automation should remain outside the first release.

## Visual Direction

FinPilot should feel:

- trustworthy
- calm
- intelligent
- approachable

The product should avoid looking like a cold, overly corporate banking app. It needs financial credibility, but with a friendlier and more modern personality.

## Recommended Color Scheme

### Primary Color

- **Teal**

Teal should serve as the main brand and interface color. It conveys clarity, balance, and growth without falling into the typical finance-app blue.

### Supporting Colors

- **Amber** for warnings and spending alerts
- **Green** for positive states such as savings progress and good financial behavior
- **Coral** for overspending signals and cautionary insights
- **Neutral grays** for structure, backgrounds, dividers, and text hierarchy

### Color Rationale

This palette gives FinPilot a distinctive identity while preserving trust. It avoids the predictable "bank blue" look and gives the product more warmth and personality.

## Layout Philosophy

FinPilot should use a layout system that is simple, readable, and strongly focused on financial clarity.

### Navigation

A **bottom tab bar with 4 to 5 tabs** should serve as the main navigation structure. This is the right foundation for a React Native + Expo mobile app and gives users fast access to the product's core areas.

### Content Structure

Each screen should use a **card-based layout** with a **sticky summary header**. The summary header should keep the most important information visible at all times, such as:

- current balance
- monthly spend
- key savings progress
- a major insight

This supports fast scanning and makes the app feel useful immediately.

### AI Assistant Placement

The AI assistant should feel persistent and central to the product experience. It should not be buried inside menus or secondary flows.

Rather than treating AI as a side feature, the interface should present it as one of the app's core destinations.

## Navigation Recommendation

### AI Assistant as a Primary Tab

The **AI assistant screen should have its own dedicated tab**.

This is important because:

- it is the product's strongest differentiator
- it improves discoverability
- non-technical users immediately understand a label like **"Ask AI"**

If the assistant is hidden behind a floating button or nested inside another screen, it weakens the product's main value proposition.

### Insights Grouping

The **Insights tab** should act as a parent section for:

- Spending Analysis
- Savings Goals
- Reports and Charts

This keeps the bottom navigation clean while grouping all data-driven finance views under one logical area.

### Profile and Settings

**Settings should live under the Profile tab**, not as a dedicated tab.

Settings are necessary, but they are not important enough in day-to-day use to take a prime slot in the main navigation.

## Recommended Tab Structure

A clean MVP tab structure could be:

1. Home
2. History
3. Ask AI
4. Insights
5. Profile

This gives FinPilot a navigation system that is easy to understand and aligned with the product's priorities.

## UX Priorities

The UI should prioritize:

- quick readability
- clear money summaries
- easy transaction logging
- immediate access to AI guidance
- visual separation of positive and negative financial signals

The product should feel helpful and judgment-aware, but not harsh or overly clinical.

## Visual Summary

FinPilot's MVP should use **9 screens**, a **teal-led color system**, and a **bottom-tab mobile layout** built around cards and persistent summaries. The AI assistant should be given primary visibility through its own tab, while analysis, goals, and reports should be grouped under an Insights section. Settings should remain inside Profile to preserve focus in the main navigation.
