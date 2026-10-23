# Overload — Product Brief

## Problem

Serious lifters who program their own training lose the thread of their own progress week to week. Today, the plan lives in a notes app: a list of exercises with the weight, reps, and sets from the last session, referenced before each workout and overwritten as the weeks go by. The notes app tells you what you did last time, but it doesn't tell you whether that number should go up, hold, or come down — and once it's overwritten, the trend is gone. The result is a lifter who shows up to the gym without a clear, data-backed answer to "should I go heavier today," and who can't look back over a month or a mesocycle and see whether they're actually progressing, plateaued, or quietly regressing without noticing.

There's a second, more specific version of this problem: the working weight for a given exercise isn't a single number if you train at more than one gym. A barbell bench press is the same barbell everywhere, but a chest press machine's "100 lbs" on one machine can be a meaningfully different resistance than "100 lbs" on another. A notes app — or any tracker that treats an exercise's weight as one global value — can't represent that, which means the numbers it shows you are quietly wrong the moment you train somewhere else.

## Target User

The first user is the product's builder, a serious lifter who programs his own training rather than following a pre-built app plan. He trains across more than one gym, uses free weights and machines, and wants a tool that tells him what to do with his numbers rather than one that just stores them. He's technical enough to want a system that reasons about his data, not just displays it, and he has no interest in a general fitness or wellness app — he wants an instrument built specifically for his own training, with nothing in it he won't use.

Overload also serves a small group of friends in the same position, and is now being opened to the public: serious lifters who either build their own plan or already keep one in a notes app, and want a tool that tells them what to do with their numbers. Each person has their own account, plan, gyms, and history, and no one can see anyone else's. It has a free plan and a paid Pro plan.

## Why Now / Why This

General-purpose lifting trackers (Hevy, Strong, Boostcamp, and similar) already solve split templating, set/rep/weight logging, and progression charts as a category — so the case for building a new one isn't that the category is unserved. It's that those tools stop at *recording* the numbers and leave the *decision* to the lifter: whether to add weight, hold, or back off is still an eyeball judgment made from a chart. This product's differentiator is that the judgment itself is automated — a rules-based progression engine reads the logged performance against the plan and tells the lifter what to do next, per lift, without them having to interpret their own trend line. The second differentiator is gym-aware weight tracking: treating a machine's working weight as specific to the gym it's in, rather than as one global number that silently drifts in accuracy the moment the lifter trains somewhere else. Neither of these exists in the mainstream tools in a form built around one person's actual training reality.

## Core Job

Tell the lifter, per lift and per session, whether to progress, hold, or deload — based on their logged performance against their own plan — so they never have to eyeball their own numbers to make that call.

## Success Definition

At 90 days, the product is working if: the lifter has fully replaced the notes app and is no longer manually deciding whether to bump a weight — the app's recommendation is what they act on. They can look at a progression chart for any lift and see a real trend rather than a list of disconnected numbers. They've caught at least one stall or plateau via the app's deload/hold signal that they would previously have missed or noticed late. And the gym-specific weight tracking has held up in practice — training at a second location hasn't corrupted the numbers or produced a recommendation that was obviously wrong for that gym's equipment. As a small multi-user product, it is also working if a friend can sign up, get their plan into the app, and train from it without help, and no account ever sees or affects another account's data. As a commercial product, it is also working if strangers who find it through the creator videos sign up, bring their plan in, finish the 14-day Pro trial, and a meaningful share choose to subscribe, with none of them losing a training record along the way.

## Non-Goals

This is not a general wellness, nutrition, or body-composition app in this version — those are a deliberately later, separate build, not a feature deferred within this one. It will not generate training programs or mesocycles on the lifter's behalf; the lifter designs their own split and blocks, and the app's job is strictly to track and adjust load within whatever plan they've built, never to author one. It will not include social features of any kind — no sharing, leaderboards, or visibility between accounts — and it will never show ads. It will not become an AI coach: the one AI feature, plan import, parses a plan the lifter wrote and never invents one. It will not offer social login, and the owner's admin tools will never show anyone's training content. It will not apply progression analysis to cardio; cardio is logged for the record only.

## Riskiest Assumption

That treating each gym's working weight for a given exercise as its own independently tracked value — rather than one global number per exercise — will actually hold up with the limited data available per gym, especially early on before enough sessions have accumulated at a second or third location to establish a reliable baseline there. If a gym-specific baseline is wrong or slow to correct, the app's recommendation at that gym could be meaningfully off, undermining trust in the one feature that most differentiates this from an off-the-shelf tracker.

With more than one account, a second assumption carries equal weight: that every read and write can be reliably scoped to the account that is acting. The application reaches the database through a connection that bypasses row-level security, so separation between accounts rests on the application scoping every query correctly. A single unscoped query would show one lifter's data to another, and nothing would visibly break.

Commercially, the riskiest assumption is that lifters will pay for interpretation, the progression insights, when capture is free and most competing apps give logging away. The Free plan keeps every lifter's data and history whole, so the test is whether the recommendations are worth $4.99 a month once the 14-day trial ends.
