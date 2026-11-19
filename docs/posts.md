# Two public posts

Publish after the repo and video are live. Post 1 is the story (numbers do the
work), post 2 is the method (the part engineers quote). Keep the repo link in
both. Do not paste screenshots of tables the tool did not print.

---

## Post 1 — the bug both suites missed

> Two test suites, both green, one order that costs eight dollars more on the phone.
>
> Same item ($25), same promo code (HACK25, 25% off).
> · browser: 25.00 − 6.25 = **18.75**
> · iPhone: 25.00 − 0.06 = **24.94**
>
> The web suite can't see the phone. The phone suite can't see the browser. So nobody
> ever compared the two answers to the same question.
>
> I built `both-ends` for the Kane CLI hackathon: one plain-English journey, run
> against Chrome *and* an iOS simulator. It aligns the two runs by intent — not by
> step index, because the browser has to dismiss a cookie banner the phone never
> shows — and reports the rows where they disagree:
>
> `discount line shows 6.25 → pass / FAIL → SPLIT`
>
> Then the useful part: it writes a repair brief containing only the split steps,
> hands it to an agent, and reruns the same journey. Two loops, six of six agree.
>
> Verified, not asserted: the numbers above were read out of real Chrome and a real
> simulator app by automation, and both runs are sealed into one evidence pack with
> a hash of every input.
>
> https://github.com/harishkotra/both-ends

---

## Post 2 — why index-based comparison is a trap

> The obvious way to compare two test runs is step 1 vs step 1, step 2 vs step 2.
> It works right up until one surface does something the other doesn't.
>
> Browser: accept cookies, add bowl, apply promo, read total.
> Phone: allow notifications, add bowl, apply promo, read total.
>
> Now every step is off by one and your diff reports eight divergences that aren't
> real — while the real one hides inside the noise.
>
> `both-ends` scores every journey anchor against every observation (token overlap,
> numbers weighted heavier than words), then takes the best **order-preserving**
> alignment. Extras have nowhere to land, so they drop out. Paraphrases still match:
> "a discount of 0.06" lands on the anchor "discount line shows 6.25", because it's
> the only slot left between its matched neighbours.
>
> One subtlety worth stealing: a step that only one surface reached is `unproven`,
> never `pass`. Most dashboards get this wrong, and it's how "the phone never
> loaded" becomes a green build.
>
> One journey, two surfaces, one proof — and the exact step where the story splits.
> 16 tests, zero runtime dependencies: https://github.com/harishkotra/both-ends
