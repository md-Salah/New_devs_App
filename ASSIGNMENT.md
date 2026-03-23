# Developer Assignment: Property Revenue Dashboard

## Background

You've joined our property management team as a junior developer. Our company manages properties for multiple clients across different time zones, and we've recently launched a new revenue dashboard system.

## The Situation

Yesterday, our CEO received some concerning calls from two of our biggest clients:

**Client A (Sunset Properties)** called saying: *"The revenue numbers on your dashboard don't match our internal records. We're showing different totals for March, and we're worried about accuracy for our board meeting next week."*

**Client B (Ocean Rentals)** mentioned: *"Something strange is happening - sometimes when we refresh the page, we see revenue numbers that look like they belong to another company. This is a serious privacy concern."*

Additionally, our finance team mentioned they've noticed some revenue totals that seem "slightly off" by a few cents here and there, but they couldn't pin down exactly when or why.

## Your Assignment

The development lead is tied up with another critical project, so you've been asked to investigate these issues. The system went live recently and there might be some bugs that weren't caught during initial testing.

**Your job**: Figure out what's going wrong and fix it.

## What You Have

### Environment Setup
```bash
# Start the development environment
docker-compose up --build

# Access the application
# Frontend: http://localhost:3000  
# Backend API: http://localhost:8000/docs
```

### Client Access Credentials

To investigate the issues, you have access to both client accounts:

**Client A (Sunset Properties)**
```
Email: sunset@propertyflow.com
Password: client_a_2024
```

**Client B (Ocean Rentals)**  
```
Email: ocean@propertyflow.com
Password: client_b_2024
```

### System Overview
- Multi-tenant architecture with isolated client data
- Revenue calculations based on property reservations
- Caching layer for improved performance
- Properties located in different time zones globally
- Financial reporting for monthly and annual summaries

## The Data

The system currently manages:
- Several property management companies as clients
- Multiple properties per client (some with similar naming/IDs)
- Reservation bookings with various amounts and currencies
- Properties spanning different time zones (Paris, New York, etc.)

## What's Expected

1. **Investigate** the reported issues by logging in as each client
2. **Identify** any bugs in the system
3. **Fix** the problems you find
4. **Create a Loom video** (5-10 minutes max) explaining your findings and fixes

## Deliverables

### Video Walkthrough (Required)
Record a **concise Loom video** demonstrating:
- What bugs you discovered and how you found them
- The root cause of each issue
- Your fix for each problem
- A quick demonstration that the fixes work

**Keep it short**: 5-10 minutes maximum. We value clarity and conciseness.

### Important Notes
- **Do NOT rebuild the system** - this is a debugging exercise
- Focus on identifying and fixing existing code issues
- Use the existing codebase structure and patterns
- Test your fixes with the provided client credentials

## Technical Notes

The codebase includes:
- Backend services for revenue calculations
- Caching mechanisms for performance
- Frontend dashboard for displaying data
- Database with client and property information

All the code, database schema, and sample data are provided in this repository.

---

**Important**: The clients are expecting a resolution quickly. Take your time to understand the system, but remember that data accuracy and privacy are critical in property management.

Good luck!