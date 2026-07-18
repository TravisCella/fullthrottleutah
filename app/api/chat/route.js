// app/api/chat/route.js
// Public support-chatbot proxy to the Anthropic API for the site-wide widget
// (app/Chat.js). Because this endpoint is intentionally unauthenticated (anonymous
// website visitors use it), it is hardened against abuse in four layers:
//
//   1. SERVER-OWNED SYSTEM PROMPT — the system prompt is defined here and the
//      client-sent `system` is IGNORED. This removes the value of abusing the
//      endpoint: it can only ever behave as the Full Throttle Utah assistant,
//      never as a general-purpose LLM billed to our Anthropic key.
//   2. INPUT CAPS — reject malformed, oversized, or over-long conversations.
//   3. PER-IP RATE LIMIT — best-effort in-memory sliding window. On serverless
//      this is per-instance and resets on cold start (not a hard wall), but it
//      meaningfully raises the cost of scripted abuse with zero dependencies.
//   4. ORIGIN/REFERER CHECK — only allow calls from our own domains. Absent
//      headers fall through to the rate limit; a present-but-mismatched header
//      is hard-blocked.
//
// max_tokens and model are pinned server-side. None of this changes the widget UX.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 1000;

// ─── Input caps (a real support chat is tiny; users never hit these) ──────────
const MAX_MESSAGES = 20;
const MAX_TOTAL_CHARS = 6000;
const VALID_ROLES = new Set(['user', 'assistant']);

// ─── Rate limit (best-effort, per serverless instance) ────────────────────────
const RATE_PER_MIN = 15;
const RATE_PER_HOUR = 60;
const hits = new Map(); // ip -> number[] (request timestamps, ms)
const MAX_TRACKED_IPS = 5000; // bound memory growth

function clientIp(request) {
  const xff = request.headers.get('x-forwarded-for') || '';
  return xff.split(',')[0].trim() || 'unknown';
}

// Returns true if the request is within limits; records the hit if so.
function rateLimitOk(ip) {
  const now = Date.now();
  const minAgo = now - 60_000;
  const hourAgo = now - 3_600_000;

  // Opportunistic cleanup to keep the Map bounded.
  if (hits.size > MAX_TRACKED_IPS) {
    for (const [k, arr] of hits) {
      const kept = arr.filter(t => t > hourAgo);
      if (kept.length === 0) hits.delete(k);
      else hits.set(k, kept);
    }
  }

  const arr = (hits.get(ip) || []).filter(t => t > hourAgo);
  const inLastMin = arr.filter(t => t > minAgo).length;
  if (inLastMin >= RATE_PER_MIN || arr.length >= RATE_PER_HOUR) {
    hits.set(ip, arr); // persist the pruned array
    return false;
  }
  arr.push(now);
  hits.set(ip, arr);
  return true;
}

// ─── Origin allow-list ────────────────────────────────────────────────────────
function hostFromHeader(value) {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

function originAllowed(request) {
  const host =
    hostFromHeader(request.headers.get('origin')) ||
    hostFromHeader(request.headers.get('referer'));

  // No Origin/Referer present (some privacy tools strip them) → don't hard-block;
  // the rate limit still applies.
  if (!host) return true;

  return (
    host === 'fullthrottleutah.com' ||
    host.endsWith('.fullthrottleutah.com') ||
    host === 'localhost' ||
    host.startsWith('localhost:') ||
    host.endsWith('.vercel.app')
  );
}

// ─── Server-owned system prompt (authoritative; client `system` is ignored) ───
const BUSINESS_CONTEXT = `You are the Full Throttle Utah virtual assistant. You help customers with jet ski rental inquiries. Be friendly, concise, and helpful. Use casual but professional language — you're talking to people who want to have fun on the water.

IMPORTANT: Keep responses SHORT — 2-3 sentences max for simple questions. Only go longer if someone asks for detailed specs or comparisons. Never use bullet points or markdown formatting — just natural conversational text.

FLEET & PRICING:

Spark Duo — 2 × 2014 Sea-Doo Spark 900 ACE HO
- Weekday (Mon-Thu): $299/day
- Weekend (Fri-Sun): $329/day
- Multi-day discounts: 2-day $286/day, 3-day $267/day, 4-day $259/day, 5+ day $245/day
- 90 HP, lightweight, nimble, fun for beginners and experienced riders
- Includes: 2 jet skis on single trailer, 4 life preservers, 2 anchoring systems, safety flags
- Security deposit: $1,000

GTX Limited Duo — 2 × 2026 Sea-Doo GTX Limited 325
- Weekday (Mon-Thu): $549/day
- Weekend (Fri-Sun): $649/day
- Multi-day discounts: 2-day $522/day, 3-day $483/day, 4-day $467/day, 5+ day $439/day
- 325 HP, 10.25" touchscreen, premium Bluetooth audio, massive swim platform
- The ultimate luxury ride — first class on the water
- Includes: 2 jet skis on single trailer, 4 life preservers, 2 anchoring systems, safety flags, Bluetooth audio
- Security deposit: $2,000

HOLIDAY SURCHARGES:
- July 4th (July 1-5): +$75/day
- Pioneer Day (July 20-25): +$75/day
- Labor Day (Aug 29 - Sept 2): +$75/day
- Memorial Day (May 23-27): +$75/day

WEEKEND PREMIUM: Already included in the weekend pricing above.

WHITE GLOVE DELIVERY: $200 flat fee — we deliver the watercraft to your chosen lake, launch it, and pick it up when you're done. Available within 45 minutes of Farmington. No towing needed.

LOCATIONS WE SERVE:
- Pineview Reservoir (Ogden Valley) — ~1hr from Farmington
- Jordanelle Reservoir (Wasatch Back) — ~45min
- Deer Creek Reservoir (Heber Valley) — ~50min
- Bear Lake (Utah/Idaho Border) — ~2.5hr
- Lake Powell (Southern Utah) — ~4.5hr

PICKUP & LOGISTICS:
- Pickup location: Farmington, UT
- Hours: 8 AM – 8 PM
- Customer tows with their own vehicle (2" ball hitch + flat 4-prong light hookup required)
- OR choose White Glove Delivery for $200 and we handle everything
- Return fuel policy: Return fully fueled or pay refuel fee ($50 Spark, $100 GTX)
- Must have valid ID
- Digital waiver required (signed online during booking)
- All riders must wear USCG-approved life vests at all times
- Minimum operator age: 16 per Utah law (Utah Code §73-18-15.1)
- RENTER AGE POLICY (IMPORTANT): The renter must be at least 25 years old. We do NOT rent to anyone under 25 — no exceptions. Date of birth is collected and verified at booking, and a driver's license photo-ID check is done at pickup. If the renter cannot prove they are 25 or older at pickup, the rental is denied and refunded minus one rental day's rate as an administrative fee. If someone says they are under 25 or asks whether under-25s can rent, politely tell them we're unable to rent to anyone under 25.

BOOKING:
- Book online at fullthrottleutah.com — takes about 2 minutes
- 50% booking deposit due at time of booking via Stripe
- Remaining 50% + security deposit due at pickup
- Cancellations 72+ hours out receive full deposit refund

WHEN ASKED ABOUT AVAILABILITY:
- You don't have access to the live calendar. Tell them to check availability at fullthrottleutah.com or text/call for specific date checks.

WHEN CALCULATING PRICES:
- For multi-day rentals, use the appropriate multi-day rate × number of days
- Add holiday surcharge if dates overlap a holiday period
- Add $200 if they want white glove delivery
- Always mention tax is additional (8.65% Utah sales tax)

WHEN SOMEONE IS READY TO BOOK:
- Direct them to fullthrottleutah.com to book online
- Mention it takes about 2 minutes and they can pay the deposit right there

TONE:
- Friendly, excited about water sports, knowledgeable
- Use "we" and "our" — you represent the business
- Don't oversell — be honest and helpful
- If you don't know something, say so and suggest they call/text
- Never make up information not provided above

CANCELLATION & WEATHER POLICY:
- 48+ hours before reservation: Full refund
- 24-48 hours before reservation: 50% refund or full credit toward future booking
- Less than 24 hours or no-show: No refund
- WEATHER: If we determine conditions are unsafe (thunderstorms, lightning, high winds over 20mph, heavy rain, reservoir closures), we offer a free reschedule to another date OR a full season credit. Light rain and overcast skies do NOT qualify — jet skis are fine in light rain. We don't cancel based on forecasts alone — decisions are made the morning of based on actual conditions.
- MID-RENTAL WEATHER: If severe weather hits while riding, come back to shore. We pause the clock. Once it's safe, remaining time restarts. If it doesn't clear up, we issue a prorated credit for unused time.
- Full policy details: https://www.fullthrottleutah.com/cancellation-policy
- When customers ask about cancellation or weather policy, give them a brief summary and always link them to the full policy page.`;

// Generic fallback the widget already renders as an assistant reply, so a block
// never looks like a crash to a (real) user and never leaks internals.
function friendlyBlock(status) {
  return Response.json(
    {
      content: [
        {
          type: 'text',
          text: "Sorry, I can't respond right now. Please try again in a moment, or book directly at fullthrottleutah.com!",
        },
      ],
    },
    { status }
  );
}

export async function POST(request) {
  try {
    // ── Layer 4: origin/referer ──────────────────────────────────────────────
    if (!originAllowed(request)) {
      console.warn('[chat] Blocked disallowed origin:', request.headers.get('origin') || request.headers.get('referer'));
      return friendlyBlock(403);
    }

    // ── Layer 3: rate limit ──────────────────────────────────────────────────
    const ip = clientIp(request);
    if (!rateLimitOk(ip)) {
      console.warn('[chat] Rate limit hit for', ip);
      return Response.json(
        {
          content: [
            {
              type: 'text',
              text: "You're sending messages a bit fast! Give me a few seconds, or book directly at fullthrottleutah.com.",
            },
          ],
        },
        { status: 429 }
      );
    }

    // ── Layer 2: input validation / caps ───────────────────────────────────────
    let payload;
    try {
      payload = await request.json();
    } catch {
      return friendlyBlock(400);
    }

    const messages = payload?.messages;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
      return friendlyBlock(400);
    }

    let totalChars = 0;
    const clean = [];
    for (const m of messages) {
      if (!m || typeof m.content !== 'string' || !VALID_ROLES.has(m.role)) {
        return friendlyBlock(400);
      }
      totalChars += m.content.length;
      if (totalChars > MAX_TOTAL_CHARS) {
        return friendlyBlock(400);
      }
      clean.push({ role: m.role, content: m.content });
    }

    // ── Layer 1: server-owned system prompt + pinned params ────────────────────
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: BUSINESS_CONTEXT, // client-sent `system` is intentionally ignored
        messages: clean,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Log full detail server-side; never echo Anthropic internals to the client.
      console.error('[chat] Anthropic error:', response.status, JSON.stringify(data).slice(0, 500));
      return friendlyBlock(200);
    }

    return Response.json(data);
  } catch (err) {
    console.error('[chat] Route error:', err.message);
    return friendlyBlock(200);
  }
}
