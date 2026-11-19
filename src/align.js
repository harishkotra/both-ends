// The core idea: never compare two surfaces by step index.
//
// A browser run has steps the phone does not ("Accept all cookies"), and a
// simulator run has gestures the browser does not ("tap Allow"). Index N on
// the web is not index N on the phone, so an index diff reports divergences
// that do not exist and hides the ones that do.
//
// Both surfaces are aligned to the journey's named steps instead, in order,
// with a global sequence alignment. Only steps that map to the same named
// journey step are ever compared.

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'is', 'are', 'be', 'was', 'were',
  'on', 'in', 'at', 'for', 'with', 'it', 'its', 'this', 'that', 'then', 'i',
  'you', 'we', 'my', 'me', 'should', 'must', 'will', 'can', 'see', 'show',
  'shows', 'display', 'displays', 'appears', 'appear', 'has', 'have', 'there',
  'from', 'into', 'by', 'as', 'so', 'up', 'out', 'all',
]);

export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9₹$%.,]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[.,]+|[.,]+$/g, ''))
    .filter((w) => w && !STOPWORDS.has(w));
}

/** Token overlap in [0,1]: 70% Jaccard, 30% containment (short anchor in a long log line). */
export function similarity(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  const shared = ta.filter((t) => setB.has(t)).length;
  const jaccard = shared / new Set([...ta, ...tb]).size;
  const containment = shared / Math.min(ta.length, tb.length);
  return 0.7 * jaccard + 0.3 * containment;
}

const MATCH_THRESHOLD = 0.34;
const GAP_PENALTY = 0.18;

/**
 * Order-preserving global alignment of `anchors` (the journey) to `observed`
 * (what a surface actually did).
 *
 * @returns {{pairs: Array<{anchor:number, observed:number|null, score:number}>,
 *            extras: number[], score: number, matched: number, total: number}}
 */
export function alignSequence(anchors, observed, opts = {}) {
  const threshold = opts.threshold ?? MATCH_THRESHOLD;
  const gap = opts.gapPenalty ?? GAP_PENALTY;
  const n = anchors.length;
  const m = observed.length;
  const score = (i, j) => (i < 0 || j < 0 ? 0 : similarity(anchors[i].text ?? anchors[i].anchor, observed[j].text));

  // dp[i][j] = best score aligning anchors[0..i) with observed[0..j)
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const back = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(''));

  for (let i = 1; i <= n; i += 1) {
    dp[i][0] = dp[i - 1][0] - gap;
    back[i][0] = 'up';
  }
  for (let j = 1; j <= m; j += 1) {
    dp[0][j] = dp[0][j - 1] - gap;
    back[0][j] = 'left';
  }

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const s = score(i - 1, j - 1);
      const diag = rectified(dp[i - 1][j - 1] + (s >= threshold ? s : -gap));
      const up = dp[i - 1][j] - gap;
      const left = dp[i][j - 1] - gap;
      const best = Math.max(diag, up, left);
      dp[i][j] = best;
      back[i][j] = best === diag ? 'diag' : best === up ? 'up' : 'left';
    }
  }

  const pairs = [];
  const extras = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const dir = back[i][j];
    if (dir === 'diag' && i > 0 && j > 0) {
      const s = score(i - 1, j - 1);
      pairs.push({ anchor: i - 1, observed: s >= threshold ? j - 1 : null, score: Number(s.toFixed(3)) });
      i -= 1;
      j -= 1;
    } else if (dir === 'up' && i > 0) {
      pairs.push({ anchor: i - 1, observed: null, score: 0 });
      i -= 1;
    } else {
      extras.push(j - 1);
      j -= 1;
    }
  }
  pairs.reverse();
  fillGaps(pairs, anchors, observed, threshold);

  const matched = pairs.filter((p) => p.observed !== null).length;
  return {
    pairs,
    extras: extras.reverse(),
    score: Number(dp[n][m].toFixed(3)),
    matched,
    total: n,
  };
}

function rectified(x) {
  return x;
}

/**
 * Paraphrase rescue. A surface often describes the same step in different words
 * ("no discount line is shown" vs "discount line shows 6.25"), scoring below the
 * match threshold. If an unmatched journey step still has unused observations
 * strictly between its matched neighbours, the best of those is the step — the
 * order constraint is what makes this safe.
 */
function fillGaps(pairs, anchors, observed, threshold) {
  const used = new Set(pairs.filter((p) => p.observed !== null).map((p) => p.observed));
  for (let i = 0; i < pairs.length; i += 1) {
    if (pairs[i].observed !== null) continue;
    let prev = -1;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (pairs[j].observed !== null) {
        prev = pairs[j].observed;
        break;
      }
    }
    let next = observed.length;
    for (let j = i + 1; j < pairs.length; j += 1) {
      if (pairs[j].observed !== null) {
        next = pairs[j].observed;
        break;
      }
    }
    const candidates = [];
    for (let k = prev + 1; k < next; k += 1) {
      if (!used.has(k)) candidates.push(k);
    }
    if (!candidates.length) continue;
    let best = null;
    for (const k of candidates) {
      const s = similarity(anchors[pairs[i].anchor].text ?? anchors[pairs[i].anchor].anchor, observed[k].text);
      if (!best || s > best.s) best = { k, s };
    }
    if (best && best.s >= threshold * 0.4) {
      pairs[i].observed = best.k;
      pairs[i].score = Number(best.s.toFixed(3));
      pairs[i].rescued = true;
      used.add(best.k);
    }
  }
}

/**
 * Align every surface's observed steps to the journey, so the two surfaces are
 * compared through the journey — not through each other or through index.
 *
 * observedBySurface: { desktop: StepRecord[], simulator: StepRecord[] }
 * stepRecords: { index, text, status }
 */
export function alignSurfaces(journey, observedBySurface) {
  const anchors = journey.steps.map((s) => ({ n: s.n, text: s.anchor, anchor: s.anchor }));
  const aligned = {};
  for (const surface of journey.surfaces) {
    const observed = observedBySurface[surface] || [];
    aligned[surface] = {
      ...alignSequence(anchors, observed),
      observedCount: observed.length,
    };
  }
  return aligned;
}
