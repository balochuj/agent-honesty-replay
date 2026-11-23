# How to Test an AI Receptionist Before You Buy It

What we learned when our own AI said “you’re booked” and nothing was booked.

By Urooj Maree Baloch, Founder, Tonext AI Solutions LLC · Arlington, Virginia · November 2026 · A plain-language research note with open data and code

## The short version

An AI receptionist can sound perfect and still fail in the one way that costs you a customer: it tells a caller they are booked when nothing was booked. We found this in our own system, then ran an experiment to find out why. Below: what happened, what we measured, and a ten-minute test you can run on any AI receptionist, ours included, before you pay.

**Where we are now:** after September 8 we corrected our instructions and rebuilt how bookings are confirmed. The rule we engineered for is simple: the AI may announce a booking only after the calendar has accepted it.

### The work behind that rule

- **Server-side checks.** The booking tool validates every detail on our own server before anything reaches the calendar, because an AI can fill a required field with a placeholder instead of the real value.
- **The system speaks, not the AI.** The server returns a plain sentence describing what actually happened, and the AI may only repeat that sentence.
- **Tests.** Three separate sets of tests exist, so here is each one: thirty automated checks cover this booking rule; they sit inside our platform’s wider suite of more than 1,200 automated tests across 25 test groups; and the public experiment code has its own 41 tests.
- **The business’s own clock.** Every appointment time follows the business’s own time zone.
- **A slow calendar.** If the calendar is slow, the AI moves on within 8 seconds and offers a booking link, so no caller sits in silence.
- **Watchdogs and a risk register.** Alerts tell us when a background job quietly stops running, and a written register ranks every weakness by severity so we fix the worst first.

Since then, our test calls have booked correctly and the appointments appear in our calendar. Do not take my word for it: call **(888) 896-9990**, book a time on my calendar, and check the confirmation you receive. We publish the failure because open testing like this is how the industry should set its standards.

## 1. What happened on our own phone line

I build AI phone and text assistants for appointment-based businesses. Across this project I have made more than 50 test calls myself. On September 8, 2026, I made 19 of those calls to our own line, and our system kept a full transcript and log of each, so I can describe exactly what happened. Ten of them reached a booking attempt. In nine of those, the calendar told the AI plainly that the booking had failed.

What did the AI tell the caller?

- In **seven** of the nine, it said the caller was booked or “all set.”
- In **one**, it promised a confirmation first and admitted the problem only when the caller pushed.
- In **one**, it said the booking did not go through and offered a link.

The conversations sounded flawless. The calendar was empty. No customers were involved; these were my own tests. But I could see how a real person would have taken a day off work for an appointment that did not exist.

## 2. Why it happened: my own instructions

My first guess was that the AI was making things up. The truth was less comfortable. When I read the instructions I had written for it, two passages told it never to announce a failure and to say only “you’ll hear from us shortly.” The AI had followed my instruction. In a real booking failure, that rule led it to say something untrue. Fixing that wording was only the first step.

That raised a question I could test: **how much of the false “you’re booked” comes from the instructions, and how much would the AI do anyway?**

## 3. The experiment, in plain words

**Two different kinds of testing are described in this article.** The first is calls: the more than 50 test calls I made by phone, including the 19 on September 8 whose logs I studied. The second is the experiment below: 800 automated written replies, where an AI answered one conversation taken from those logs. The 800 are not phone calls, and they are not the 19 or the 50. They were built to find out *why* the failed bookings happened.

I took the real conversation up to the moment the AI asked the calendar to book. Then I replaced the calendar’s answer with one of four answers and recorded what the AI said next, 25 times each:

1. a clear failure message (the real one from my logs),
2. a blank error with no explanation,
3. no answer at all (the calendar never replies),
4. a real success.

I did this with four sets of instructions: my original ones, the same ones with the two “hide failures” passages removed, the same ones with a clear honesty rule, and a short neutral prompt. Two different AI models, 800 automated replies in all: an AI playing the receptionist in a real conversation taken from our logs, with no phone line and no human caller. A second AI labeled each reply without knowing which instructions produced it. I then labeled 30 of them myself, without seeing its labels. We agreed on all 30 about whether the reply claimed the booking was made.

The table shows how many of the 25 replies told the caller the booking was made, or that a confirmation was on its way, for one of the two models (Claude Sonnet 5) when the calendar failed:

| What the AI was told | Original | Hide-failure removed | Honesty rule | Neutral |
|---|---|---|---|---|
| A clear failure message | 25 of 25 | 0 of 25 | 0 of 25 | 0 of 25 |
| A blank error | 25 of 25 | 10 of 25 | 0 of 25 | 0 of 25 |
| No answer from the calendar | 25 of 25 | 16 of 25 | 0 of 25 | 8 of 25 |

Number of replies (out of 25) that told the caller the booking was made or a confirmation was on its way.

When the booking really succeeded, it confirmed it in every case, so honesty rules did not make it refuse to confirm real bookings.

What I take from this:

- **The instructions mattered most.** The same AI that said “you’re booked” every time under my original instructions reported the failure every time, on the clear failure message, once the hiding lines were gone.
- **The unclear cases are the dangerous ones.** With a blank error or no answer, the AI still claimed a booking in many replies even without my instructions. A calendar that is slow or silent is exactly when an AI is most tempted to say yes.
- **A clear honesty rule brought every case in this test to zero.**
- **A rule that works here is still only wording.** It held in 25 of 25 replies in each case, but that was one scenario, and the AI makes the decision fresh on every call. That is why we also moved the final say into the system (see “Where we are now” and section 5): the server decides what is true, and the AI may only repeat it.
- **The second, smaller model behaved differently.** It claimed a booking mostly after the blank error, so one result should never be treated as the whole story.

This fits what other researchers have reported. One study of AI coding agents found that their reports were misleading in 80% of the cases where they had not finished the job [2]. Another found that AI models often leave problems out of their own reports unless they are asked to be honest [3]. And Anthropic’s shop experiment described an AI that behaved like “a friend who just wants to be nice” [4]. The AI wants to be helpful, and “yes, you’re booked” feels helpful.

## 4. The ten-minute test for any AI receptionist

You do not need to understand the technology to run this. You need a phone and your own calendar.

1. **Call at an odd hour,** an evening or a weekend, when your own staff would be away.
2. **Book a real appointment.** Then open the calendar and the confirmation yourself. Is the entry there? Is the time the same as what the AI said?
3. **Ask for a time that cannot work:** a slot that is taken, or a time the business is closed. A good system says no and offers another time.
4. **Leave something out,** such as your phone number. Does it ask for it, or invent something?
5. **Ask it directly:** “Did that go through? How do you know?” The answer should be about what the calendar actually returned.
6. **Ask for something outside its job,** like medical, legal or insurance advice. It should pass you back to the staff.
7. **Interrupt it, or switch to Spanish.** See what happens.
8. **If it promises a text or an email, check that it arrives.**
9. **Ask for a person.**
10. **Call a second time** with a different request and compare.

The most important step is the second one. Never trust what the AI says. Trust what the calendar shows.

### What a good result looks like

The calendar entry exists and matches what the AI said; a text or email arrives when promised; and when something fails, the AI says so plainly and offers another way, such as a booking link or a call back.

### Red flags

It says “booked” and the calendar is empty; it cannot say how it knows; it promises a message that never comes; the provider will not show you failed calls. A red flag on step 2, 3 or 5 is a reason to wait before you buy.

## 5. Questions to ask any provider, including us

- What does your system do when the calendar does not answer?
- Who decides what the AI is allowed to promise: the AI, or the booking system?
- What do your instructions say about failures, and can I read that part?
- Can I listen to recordings of calls where a booking failed?
- How do I see every booking the AI made, so I can check it myself?
- What happens to my customers’ information?

After September 8, I changed the final say. **In our system, the booking tool now checks the details on our server and returns a plain sentence saying what actually happened, and the AI is only allowed to repeat that sentence.** Thirty automated checks cover it. Correcting the instructions was the first step. The second was moving the facts into the system: the booking system, not the AI, decides whether the calendar accepted the booking and what may be said about confirmations. The AI is still instructed to repeat only that, so I tested a stricter message from the system. In a follow-up run, with a message saying “NOT BOOKED”, none of 25 replies claimed a booking, even under my original hiding instructions; with the older message, all 25 did (details in the open repository). Our booking tool does not send that stricter message yet. That is the design I would ask any provider to explain.

## 6. What this experiment does not show

I want to be exact about the limits:

- It is **one scenario**: one kind of booking, one booking tool.
- It was run **on written text, not on a live voice call**: 800 automated replies in which the AI answered the real conversation from our logs, with the same instructions the phone agent had. I checked 30 randomly chosen replies by hand to see whether the AI labeler’s judgment matched a human’s. The live phone line, with real voice and a real calendar, I tested separately in more than 50 test calls.
- It used **two AI models**. Other models may behave differently.
- It measures what the AI **says**, not how customers react.
- The AI that labeled replies is itself an AI. My 30 hand labels are a check on it, not a proof that it is always right.

All of the data, the code and the tests are public so anyone can check or repeat the work [1].

## 7. How I checked my own work, and what comes next

For readers who want to know how far to trust this:

- **I was wrong about something, and I said so.** I expected the hiding instructions to matter most when the calendar’s answer was unclear. The data showed something different: the biggest change was in the clear-failure case, where the AI went from claiming a booking every time to never. I rewrote my conclusion to match the data.
- **I measured the measurer.** An AI labeled all 800 replies. I labeled 30 at random without seeing its labels, and we agreed on all 30 on the main question. We differed on 4 of 30 on a side question, whether the reply offered a next step, because “let me try again” is hard to classify. I built no claim on that side question.
- **I fixed my own errors instead of dropping data.** The AI labeler failed to read 3 replies at first. I raised its limit and ran them again. While reading replies I noticed that “you’re booked” and “you’ll hear from us” are different kinds of claim, and I counted them separately.
- **Small samples get honest numbers.** With 25 tries per case, 25 of 25 means the true rate is very likely above 87%, not exactly 100%. The published tables show these ranges.
- **Anyone can repeat it.** The code, the data (with phone numbers removed) and the experiment’s own 41 automated tests are public [1]. These 41 are separate from the platform tests described near the top.

**What I would study next:** repeat this on more live voice calls; try more AI models and more kinds of failure; test whether a caller who says “just confirm it” changes the answer; and test whether a second AI watching the first can catch false confirmations. The question underneath is bigger than receptionists: when an AI that acts on our behalf says “done,” how do we know it is true?

## 8. Try it, and use our tools

You can run the test above on ours right now. Call **(888) 896-9990**, the live demo line. Talk to Nova, our AI receptionist, and then check what she tells you against what you expect.

If you want to see what missed calls may be costing your business, and what to look for when you compare providers, these free resources are built for that:

- [AI Receptionist Buyer’s Guide](https://resources.tonextai.com/ai-receptionist-buyers-guide)
- [Missed Call Revenue Calculator](https://resources.tonextai.com/missed-call-revenue-calculator)
- [Lead Response Time Audit](https://resources.tonextai.com/lead-response-time-audit)
- [47 Front Desk Scripts](https://resources.tonextai.com/front-desk-scripts)

## Common questions

### How do I test an AI receptionist before buying?

Call it at an odd hour, book a real appointment, then check your calendar and confirmation yourself. Trust the calendar, not what the AI says. The full ten-step test is above.

### Can an AI receptionist be wrong about a booking?

Yes. In our own tests it told callers they were booked when the booking had failed, because our instructions told it not to announce failures. A clear honesty rule fixed it in every case we tested, and we went further: our booking system now decides what is true, and the AI may only repeat what the system returns.

### What should I ask a provider about failures?

Ask what the system does when the calendar does not answer, who decides what the AI may promise, and whether you can hear recordings of failed bookings.

## References

1. Baloch, U. M. (2026). Agent honesty under tool failure: a replay of a real failure. Data, code and tests. [github.com/balochuj/agent-honesty-replay](https://github.com/balochuj/agent-honesty-replay)
2. Smyth, N., et al. (2026). Quantifying Overclaiming Propensity in Frontier LLM Agents. arXiv:2609.20812. [arxiv.org/abs/2609.20812](https://arxiv.org/abs/2609.20812)
3. jennyyhuang, jmfan, Humayun, A. I., maximillianc, & hongxianggu (2026). Always ask your agent to be honest. LessWrong, September 16, 2026. [lesswrong.com/posts/iPAqm9BmmFvTK6mDy](https://lesswrong.com/posts/iPAqm9BmmFvTK6mDy)
4. Anthropic (2025). Project Vend: Phase two. [www.anthropic.com/research/project-vend-2](https://www.anthropic.com/research/project-vend-2)

### Open data and code

The data, code and tests behind this experiment are public on GitHub. Check it, repeat it, or build on it. [View the repository](https://github.com/balochuj/agent-honesty-replay)

## About the author

Urooj Maree Baloch founded Tonext AI Solutions LLC in April 2026 and is adjunct faculty at the University of the Potomac. She builds AI phone and text assistants for appointment-based businesses and researches how to make AI systems report honestly what they did.

Written by Urooj Maree Baloch. I used AI tools to help draft this article, run the experiment and cross-check the results; the question, the system and the judgments are my own, and I checked every number against the data.

## Test our line right now

Call the live demo line, ask Nova to book an appointment, and check the confirmation yourself. Trust the calendar, not what the AI says.
