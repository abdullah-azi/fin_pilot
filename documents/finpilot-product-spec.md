# FinPilot Product Document

## 1. Project Overview

FinPilot is an AI-assisted personal finance mobile application designed to help users track income and expenses, evaluate spending decisions, identify unhealthy spending habits, and improve savings behavior.

The product combines traditional personal finance management with conversational AI guidance. Instead of only recording transactions, FinPilot aims to help users make better day-to-day money decisions through analysis, feedback, and personalized recommendations.

## 2. Problem Statement

Most personal finance tools focus heavily on transaction recording, charts, and static budget categories. While these features are useful, they often fail to answer the real questions users have at the moment of decision-making, such as:

- Can I afford this purchase right now?
- Am I overspending this month?
- What do I spend too much on?
- Where should I cut back?
- How much should I be saving based on my current income and spending?

This gap creates a poor user experience for people who need practical guidance rather than raw financial data. As a result, many users either abandon finance apps or continue making weak spending decisions despite having access to their numbers.

## 3. Product Vision

FinPilot aims to become a personal financial co-pilot that helps users understand their money, improve financial discipline, and make smarter spending choices through simple tracking and AI-generated insights.

## 4. Goals

- Help users maintain a clear record of income and expenses
- Provide purchase-feasibility guidance before users spend money
- Identify major spending categories and negative spending patterns
- Recommend realistic cost-cutting opportunities
- Suggest savings goals tailored to the user's behavior
- Deliver understandable reports and visual analytics

## 5. Target Users

- Students managing limited monthly budgets
- Young professionals trying to control spending
- Users who want simple money guidance instead of complex accounting tools
- People interested in AI-assisted personal finance insights

## 6. Core Features

### 6.1 Income and Expense Tracking

Users can manually enter:

- income transactions
- expense transactions
- transaction amount
- date
- category
- optional notes

This forms the financial data foundation for all insights and recommendations.

### 6.2 AI Purchase Feasibility Check

Users can ask the app whether a planned purchase is financially reasonable. The system evaluates:

- available balance context
- recent spending trends
- current month behavior
- savings priorities

The AI response should explain the reasoning in clear language rather than only returning a yes or no answer.

### 6.3 Spending Analysis

FinPilot identifies:

- highest spending categories
- recurring expense patterns
- spending spikes
- areas where the user may be overspending

### 6.4 Savings Goal Suggestions

The app suggests savings targets based on:

- income level
- spending behavior
- category trends
- user priorities

### 6.5 Reports and Graphical Analytics

The app provides:

- monthly summaries
- category breakdowns
- spending trend charts
- income vs expense views
- savings progress views

### 6.6 Spending Behavior Insights

FinPilot gives users behavioral feedback such as:

- disciplined spending
- moderate overspending
- impulsive buying tendency
- weak savings discipline

This feature should be framed as informative guidance, not financial judgment.

### 6.7 Smart Shopping Recommendations

In later versions, the app may search the web for better-priced purchase options and recommend more feasible buying alternatives.

## 7. Minimum Viable Product

The MVP should focus on the smallest useful version of FinPilot that proves the product value.

### Included in MVP

- user authentication
- manual income entry
- manual expense entry
- transaction categorization
- dashboard with current financial summary
- monthly spending breakdown
- AI purchase-feasibility assistant
- AI-generated spending insights
- basic savings goal suggestions
- simple charts and reports

### Excluded from MVP

- automatic bank syncing
- advanced investment tracking
- bill payment integrations
- multi-user family budgeting
- web-based price comparison
- complex financial forecasting

## 8. Functional Requirements

### Authentication

- Users must be able to sign up and log in securely
- Each user must access only their own financial data

### Transaction Management

- Users must be able to create, view, edit, and delete income records
- Users must be able to create, view, edit, and delete expense records
- Transactions must support categories, dates, amounts, and notes

### Insights and AI Guidance

- The system must generate affordability guidance from user data
- The system must summarize spending patterns in natural language
- The system must provide savings suggestions based on transaction history

### Reporting

- The system must generate monthly summaries
- The system must show category-based spending distribution
- The system must present visual financial analytics

## 9. Non-Functional Requirements

- Strong user-data privacy and secure authentication
- Fast response times for standard app actions
- Reasonable AI response latency for assistant interactions
- Scalable backend structure for future AI and analytics expansion
- Clear auditability of financial calculations performed by the system

## 10. Technical Stack

### Mobile Application

- React Native
- Expo
- TypeScript

### Backend

- FastAPI
- Python

### Database

- PostgreSQL

### Authentication

- JWT-based authentication
- Secure token storage on device

### AI Layer

- Provider-agnostic AI service abstraction
- Primary provider options: Grok or DeepSeek
- Fallback option: Hugging Face hosted or self-served model

### Analytics and Visualization

- Backend-generated summaries and metrics
- Mobile charting library for visual analytics

## 11. Proposed High-Level Architecture

1. The mobile app sends user actions and questions to the FastAPI backend.
2. The backend stores and retrieves financial data from PostgreSQL.
3. The backend performs deterministic financial calculations such as totals, balances, and category spending.
4. The backend sends structured financial context to the AI provider for explanation, advisory, and recommendation responses.
5. The backend returns both calculated results and AI-generated guidance to the mobile app.

This architecture ensures that financial facts come from application logic and database records, while AI is used for interpretation and user-facing guidance.

## 12. AI Design Principle

FinPilot should not rely on AI as the source of truth for financial calculations.

Instead:

- balances, totals, and budget math must come from backend logic
- AI should explain, summarize, and personalize
- provider integrations should be swappable without changing the mobile app

## 13. Future Enhancements

- bank account integrations
- smart web search for better-priced purchases
- merchant and subscription detection
- proactive budget alerts
- personalized spending score
- long-term financial planning
- regional pricing and store recommendations

## 14. Success Criteria for MVP

The MVP will be considered successful if users can:

- track their finances consistently
- understand where their money is going
- ask whether a purchase is financially feasible
- receive useful savings and spending guidance
- view clear summaries and reports without needing financial expertise
