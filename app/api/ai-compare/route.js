// app/api/ai-compare/route.js
// Version: 2026-06-03 — Auth Firebase reads with FIREBASE_DATABASE_SECRET
// Last edited: June 3 2026
// Change: Both Firebase Realtime DB fetches now pass ?auth=${FIREBASE_DATABASE_SECRET}
//         so they continue to work after the rules are locked down to deny all
//         unauthenticated access. No other behavior changed — same prompt, same
//         model, same response shape.
//
// Builds on: 2026-05-31 initial AI vision damage detection
// Required env: ANTHROPIC_API_KEY, FIREBASE_DATABASE_SECRET (NEW)

import { NextResponse } from 'next/server';

const DB_URL = 'https://full-throttle-utah-ac72b-default-rtdb.firebaseio.com';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

// Strip "data:image/jpeg;base64," prefix from a data URL — Anthropic API wants raw base64
function stripDataUrlPrefix(dataUrl) {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  return match ? match[1] : dataUrl;
}

// Pick the FIRST photo of each zone — keeps cost predictable and avoids redundant angles
function firstPhotoPerZone(photosByZone) {
  const result = {};
  if (!photosByZone || typeof photosByZone !== 'object') return result;
  for (const [zoneId, photos] of Object.entries(photosByZone)) {
    if (Array.isArray(photos) && photos.length > 0) {
      result[zoneId] = photos[0];
    }
  }
  return result;
}

// Build the content array for the Anthropic API call
// Interleaves text labels with images so Claude knows which zone each photo represents
function buildPromptContent(outPhotos, inPhotos) {
  const content = [];

  // System prompt explaining the task
  content.push({
    type: 'text',
    text: `You are an expert watercraft damage inspector for Full Throttle Utah, a jet ski rental company. You will be shown two sets of photos for the same jet ski (Sea-Doo Spark or GTX Limited):

SET 1 — CHECK-OUT photos: condition when the customer received the watercraft
SET 2 — CHECK-IN photos: condition when the customer returned the watercraft

Your job: Identify NEW damage that was not present at check-out. Be precise. Distinguish between normal wear/dirt and actual damage.

Common Sea-Doo damage to look for:
- Cracked, broken, or missing rear sponsons (the rear corner foot rest extensions)
- Hull scratches, gouges, or gelcoat damage on the bottom
- Cracked, scuffed, or broken plastic body panels
- Bent trailer hitch or damaged trailer
- Cracked windshield or damaged gauge display
- Missing screws, bolts, decals, or fittings
- Impeller nicks, dents, or bent blades
- Bent intake grate

IMPORTANT GUIDELINES:
- Be conservative — water spots, light dirt, sand, or wet surfaces are NOT damage
- Different lighting between photos is NOT damage
- Slight angle differences are NOT damage
- Only flag actual physical damage that wasn't present at check-out
- When uncertain, mark confidence as "low" and severity as "minor"
- For each zone, describe the SPECIFIC LOCATION of any damage (e.g., "lower right corner near drain plug")

Return your analysis as a single JSON object with this exact structure (no markdown fences, no other text):

{
  "findings": [
    {
      "zone": "<zone name as labeled below>",
      "severity": "clear" | "minor" | "damage" | "critical",
      "description": "Specific description of what changed and where on the watercraft",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "verdict": "CLEAR" | "MINOR" | "DAMAGE_FOUND" | "CRITICAL",
  "summary": "1-2 sentence overall assessment of the return condition"
}

Severity guide:
- "clear" = identical or no relevant change (do NOT include in findings array)
- "minor" = cosmetic wear, small scuff, light scratch — review but typically not chargeable
- "damage" = clear new physical damage (chip, crack, dent, broken part) — chargeable
- "critical" = safety issue or major damage (broken sponson, impeller damage, hull crack, structural)

Verdict guide:
- "CLEAR" = no findings of severity minor or higher
- "MINOR" = only minor findings, no damage or critical
- "DAMAGE_FOUND" = at least one damage finding, no critical
- "CRITICAL" = at least one critical finding`,
  });

  // CHECK-OUT photos section
  content.push({
    type: 'text',
    text: '\n\n========== SET 1: CHECK-OUT PHOTOS (baseline condition at pickup) ==========',
  });

  for (const [zoneId, photo] of Object.entries(outPhotos)) {
    const base64 = stripDataUrlPrefix(photo);
    if (!base64) continue;
    content.push({ type: 'text', text: `\n[CHECK-OUT] Zone: ${zoneId}` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
    });
  }

  // CHECK-IN photos section
  content.push({
    type: 'text',
    text: '\n\n========== SET 2: CHECK-IN PHOTOS (return condition) ==========',
  });

  for (const [zoneId, photo] of Object.entries(inPhotos)) {
    const base64 = stripDataUrlPrefix(photo);
    if (!base64) continue;
    content.push({ type: 'text', text: `\n[CHECK-IN] Zone: ${zoneId}` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
    });
  }

  content.push({
    type: 'text',
    text: '\n\nNow analyze the photos and return the JSON object as specified. JSON only — no preamble, no markdown fences.',
  });

  return content;
}

export async function POST(request) {
  try {
    const { checkoutId, checkinId, password } = await request.json();

    if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured on the server' },
        { status: 500 }
      );
    }

    // 2026-06-03 — Firebase rules are now locked to deny direct access.
    // We need the database secret to read inspection records server-side.
    const dbSecret = process.env.FIREBASE_DATABASE_SECRET;
    if (!dbSecret) {
      return NextResponse.json(
        { error: 'FIREBASE_DATABASE_SECRET is not configured on the server' },
        { status: 500 }
      );
    }
    const authParam = `?auth=${encodeURIComponent(dbSecret)}`;

    if (!checkoutId || !checkinId) {
      return NextResponse.json({ error: 'Missing checkoutId or checkinId' }, { status: 400 });
    }

    // Fetch both inspections from Firebase in parallel — now with admin auth.
    const [outRes, inRes] = await Promise.all([
      fetch(`${DB_URL}/inspections/${checkoutId}.json${authParam}`),
      fetch(`${DB_URL}/inspections/${checkinId}.json${authParam}`),
    ]);
    const out = await outRes.json();
    const inn = await inRes.json();

    if (!out || !inn) {
      return NextResponse.json(
        { error: 'One or both inspections not found in Firebase' },
        { status: 404 }
      );
    }

    // Reduce to 1 photo per zone for cost control
    const outPhotos = firstPhotoPerZone(out.photos);
    const inPhotos = firstPhotoPerZone(inn.photos);

    if (Object.keys(outPhotos).length === 0 || Object.keys(inPhotos).length === 0) {
      return NextResponse.json(
        { error: 'No photos found in one or both inspections' },
        { status: 400 }
      );
    }

    // Build the Claude API request
    const content = buildPromptContent(outPhotos, inPhotos);

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('[ai-compare] Anthropic API error:', apiRes.status, errText);
      return NextResponse.json(
        { error: 'AI analysis failed', status: apiRes.status, details: errText },
        { status: 500 }
      );
    }

    const aiResponse = await apiRes.json();
    const responseText = aiResponse.content?.[0]?.text || '';

    // Parse Claude's JSON response
    let parsed;
    try {
      const cleaned = responseText.replace(/^```json\s*|```\s*$/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[ai-compare] Failed to parse Claude response:', responseText);
      return NextResponse.json(
        {
          error: 'AI response was not valid JSON',
          raw: responseText.slice(0, 500),
        },
        { status: 500 }
      );
    }

    // Filter out "clear" findings — they shouldn't appear in the UI
    const findings = (parsed.findings || []).filter(
      f => f && f.severity && f.severity !== 'clear'
    );

    // Layer in the manual fuel check from the check-in inspection
    if (inn.fuelOk === false) {
      findings.push({
        zone: 'Fuel',
        severity: 'fee',
        description: 'Watercraft returned without a full tank — refuel fee applies (actual cost + 20%)',
        confidence: 'high',
        note: 'Watercraft returned without a full tank — refuel fee applies (actual cost + 20%)',
      });
    }

    // Mirror description into `note` for UI compatibility (existing UI reads `f.note`)
    for (const f of findings) {
      if (!f.note && f.description) f.note = f.description;
    }

    // Recompute verdict if fuel fee was added and AI said CLEAR
    let verdict = parsed.verdict || 'CLEAR';
    if (verdict === 'CLEAR' && findings.some(f => f.severity === 'fee')) {
      verdict = 'FEES_APPLY';
    }
    if (findings.some(f => f.severity === 'critical')) verdict = 'CRITICAL';
    else if (findings.some(f => f.severity === 'damage')) verdict = 'DAMAGE_FOUND';

    console.log(`[ai-compare] ${out.customerName} · ${out.machineName} → ${verdict} (${findings.length} findings)`);

    return NextResponse.json({
      ok: true,
      verdict,
      findings,
      summary: parsed.summary || '',
      checkoutTime: out.timestamp,
      checkinTime: inn.timestamp,
      customer: out.customerName || inn.customerName,
      machine: out.machineName || inn.machineName,
      checkoutPhotos: out.photoCount || 0,
      checkinPhotos: inn.photoCount || 0,
      tokensUsed: {
        input: aiResponse.usage?.input_tokens,
        output: aiResponse.usage?.output_tokens,
      },
    });

  } catch (err) {
    console.error('[ai-compare] Fatal error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
