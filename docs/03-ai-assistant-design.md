# AI Assistant Design

## What it is
A chat panel for logged-in customers. The customer writes "a 60-minute session on Friday afternoon". The assistant calls tools to find real free times and shows a **proposal card**. The booking exists only after the customer presses **Confirm**.

## Why "propose, never act"
A language model can be wrong, and text from users (or from data) can try to steer it (prompt injection). If the model could book directly, a mistake or a trick would change real data. Here the model has no way to change data. The Confirm button calls the same endpoint as the normal booking page, which re-checks everything.

```text
customer text -> server -> model --asks--> tools (read or propose) --> model --> reply + proposal cards
                                                                                  |
                                       customer presses Confirm -> POST /api/bookings (full checks)
```

## Tools
| Tool | Type | Notes |
|---|---|---|
| list_services | read | id, duration, price |
| get_availability | read | free start times for one service and date |
| list_my_bookings | read | only the logged-in customer's upcoming bookings |
| propose_booking | propose | checks the time is really free; returns a card |
| propose_cancellation | propose | checks ownership and the cancellation deadline; returns a card |

## Controls (all covered by tests)
| Risk | Control |
|---|---|
| Model books or cancels by itself | No such tool exists |
| Forged conversation (fake roles, huge text) | Server keeps only user and assistant text, 1000 characters each, 20 turns |
| Runaway loops | At most 6 model calls per question, 700 tokens per answer, 25 s timeout |
| Cost | Daily cap (AI_DAILY_LIMIT), per-user hourly cap, login required, small model by default |
| Prompt injection from tool data | Prompt says tool results are data; tools return only business facts, never customer notes |
| Asking for secrets | Prompt forbids asking for passwords, cards or health details; UI warns users |
| Provider outage | Clear message; the booking form still works |
| No API key | Assistant is switched off and hidden; the rest works |

## Evaluating it
Tests use a scripted fake model so they are fast, free and repeatable. They prove the plumbing and the safety rules, not the model's wording. To judge quality, keep a list of 20 real requests ("tomorrow after lunch", "cancel my Friday booking", "can I book for my friend") and check each by hand after any prompt or model change. The prompt lives in `src/ai/assistant.js`; the model name is the `AI_MODEL` setting.

## Cost thinking
Each customer question is 1 to 6 model calls of a few hundred tokens. With the small default model and a cap of 200 questions per day, the worst case per day is small, but check current prices with your provider and set a spending limit there too. The assistant can also run on a free plan such as Groq's (set `AI_PROVIDER=groq` and `AI_API_KEY`); free plans have small per-minute token limits, so a busy moment can show the "assistant unavailable" message and the normal booking form still works. `src/ai/openaiCompatClient.js` translates between this project's message format and the common OpenAI-style format, so the safety rules in `assistant.js` and `tools.js` are unchanged.
