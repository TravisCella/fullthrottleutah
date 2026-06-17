// lib/agreement-text.js
// Version: 2026-06-06 — Initial (Phase 2 of rental agreement rollout)
//
// SINGLE SOURCE OF TRUTH for the FTU Rental Agreement. This module is imported by:
//   • app/booking.js          — renders the agreement in Step 5 for customer to sign
//   • app/api/webhook/route.js — uses AGREEMENT_VERSION when writing to Sheet column V
//   • app/agreement/[bookingId]/page.jsx — renders the signed agreement for review (Phase 3)
//   • app/api/webhook/route.js — references in customer confirmation email
//
// VERSIONING DISCIPLINE:
// When the agreement text changes in any material way:
//   1. Bump AGREEMENT_VERSION (semver)
//   2. Customers who signed older versions continue to see their version in the
//      /agreement/[bookingId] page — we never rewrite history.
//   3. Old versions are preserved here in this file (commented-out below current)
//      or in git history.
//
// Content reviewed by attorney as of 2026-06-06.

// ─── Current version ────────────────────────────────────────────────────────
export const AGREEMENT_VERSION = 'v1.0.0';
export const AGREEMENT_EFFECTIVE_DATE = '2026-06-06';

// ─── Top-level preamble ─────────────────────────────────────────────────────
export const AGREEMENT_PREAMBLE = {
  title: 'FULL THROTTLE UTAH — RENTAL AGREEMENT',
  about: [
    'This Rental Agreement ("Agreement") is between TW Assets LLC, a Utah limited liability company doing business as Full Throttle Utah ("FTU," "we," "us," "our"), and the individual identified as the renter in the booking record ("Renter," "you," "your"). By completing the booking and electronically signing below, you agree to be legally bound by all terms herein.',
    'This Agreement complements but does not replace the separate Liability Waiver, which addresses assumption of risk and personal injury. Both documents are required for rental.',
  ],
};

// ─── The 13 sections ────────────────────────────────────────────────────────
// Each section has: number, title, optional intro paragraph, and an array of
// clauses. Clauses can have sub-bullets where the original document uses them.

export const AGREEMENT_SECTIONS = [
  {
    number: 1,
    title: 'IDENTITY & ELIGIBILITY',
    intro: 'By signing this Agreement, you represent and warrant that:',
    clauses: [
      { id: '1.1', text: 'You are at least 18 years of age.' },
      { id: '1.2', text: 'The name, address, phone number, and email provided during booking are true and accurate.' },
      { id: '1.3', text: 'You hold a valid, current Utah Boating Safety Course completion card if you were born on or after January 1, 1986, as required by Utah Code §73-18-9, OR you will obtain one prior to operating the rented equipment.' },
      { id: '1.4', text: 'You will be the primary operator. If others will operate the equipment, you affirm they meet the eligibility requirements above and will provide their information to FTU upon request.' },
      { id: '1.5', text: 'You have not had a watercraft operator\'s license suspended or revoked in any jurisdiction within the past five (5) years.' },
    ],
  },
  {
    number: 2,
    title: 'RESERVATION & PAYMENT',
    clauses: [
      { id: '2.1', text: 'Full payment is due at booking. The total rental price displayed at checkout — including base rental, holiday surcharges, white-glove delivery (if applicable), spare vest fees (if applicable), Lake Powell decontamination fees (if applicable), and any other line items — is charged in full at the time of booking via Stripe.' },
      {
        id: '2.2',
        text: 'Card-on-file authorization. By providing your payment card during booking, you authorize FTU to retain your card on file and to charge it for any amounts owed under this Agreement, including but not limited to:',
        bullets: [
          'Security deposit captures for damages',
          'Cleaning fees',
          'Fuel reimbursement',
          'Late return fees',
          'Replacement value for lost or stolen equipment',
          'Collection costs and attorney\'s fees',
        ],
      },
      { id: '2.3', text: 'Payment failures. If your card is declined for any charge under this Agreement, you remain liable for the full amount owed and agree to provide an alternative payment method within seventy-two (72) hours of notification.' },
    ],
  },
  {
    number: 3,
    title: 'CANCELLATION POLICY',
    clauses: [
      { id: '3.1', text: 'The cancellation tiers below apply to all rental bookings. By signing this Agreement you acknowledge having reviewed FTU\'s posted Cancellation Policy at fullthrottleutah.com/cancellation-policy and that the terms here govern in case of any conflict.' },
      {
        id: '3.2',
        text: 'Cancellation timing and refund:',
        bullets: [
          'More than 7 days before rental start: Full refund minus a $50 processing fee per booking',
          '3 to 7 days before rental start: 50% refund',
          'Less than 3 days before rental start: No refund. Full booking forfeit.',
          'No-show on rental day: No refund. Full booking forfeit.',
        ],
      },
      {
        id: '3.3',
        text: 'Weather cancellations. If FTU determines in our reasonable discretion that conditions are unsafe (high winds, lightning, dangerous water conditions), we will offer:',
        bullets: [
          'Full credit toward a future booking within the same season, OR',
          'Full refund of the rental fee (white-glove delivery fees retained if delivery already occurred)',
        ],
      },
      { id: '3.4', text: 'Customer-initiated weather cancellations are subject to the timing tiers in Section 3.2 above. FTU is not obligated to cancel for weather unless conditions meet FTU\'s safety threshold.' },
    ],
  },
  {
    number: 4,
    title: 'SECURITY DEPOSIT',
    clauses: [
      {
        id: '4.1',
        text: 'A security deposit is required for each rental ($1,000 for the Spark Duo; $2,000 for the GTX Limited Duo). The deposit may be collected by FTU either as:',
        bullets: [
          'A pre-authorization hold on a payment card, OR',
          'A cash deposit at pickup, OR',
          'A separate card authorization placed before, at, or shortly after pickup',
        ],
      },
      {
        id: '4.2',
        text: 'Application of deposit. Upon return of the equipment, FTU will inspect the equipment and assess any charges. The deposit, plus any amounts charged to your card-on-file, will be applied in the following order of priority:',
        bullets: [
          'Damage to equipment (Section 5)',
          'Cleaning fees beyond normal use',
          'Fuel reimbursement and premium (Section 6)',
          'Late return fees (Section 7)',
          'AIS decontamination, if applicable',
          'Other amounts owed under this Agreement',
        ],
      },
      { id: '4.3', text: 'Any remaining balance of the deposit will be released or refunded to you within seven (7) business days of rental return, subject to bank processing times.' },
      { id: '4.4', text: 'Deposit insufficiency. If damages, fees, and other amounts exceed the security deposit, you remain liable for the difference, which FTU may charge to your card-on-file, invoice you for, or refer to collections under Section 12.' },
      { id: '4.5', text: 'Pre-authorization disclosure. A pre-authorization hold reserves funds on your card but is not a charge unless captured. The hold may appear on your statement until released. Standard release times depend on your bank but typically range from 5 to 10 business days.' },
    ],
  },
  {
    number: 5,
    title: 'DAMAGE RESPONSIBILITY',
    clauses: [
      { id: '5.1', text: 'You are responsible for all damage to the rented equipment occurring from the moment of pickup until the equipment is returned to FTU\'s care, regardless of cause and regardless of fault, except for damage caused by FTU\'s own gross negligence or pre-existing defects documented at check-out.' },
      { id: '5.2', text: 'Pre-existing damage is documented through the FTU Inspect check-out process at the start of each rental. Photographs taken at check-out establish the equipment\'s condition at the start of your rental window. You are encouraged to review these photos and immediately report any concerns to FTU.' },
      {
        id: '5.3',
        text: 'Damage assessment. At return, FTU will conduct a check-in inspection comparing the equipment\'s condition to the check-out documentation. Damage will be assessed based on:',
        bullets: [
          'Documented physical comparison (FTU Inspect photos and AI comparison reports)',
          'Manufacturer parts and labor pricing',
          'FTU\'s reasonable judgment of repair vs. replacement need',
        ],
      },
      {
        id: '5.4',
        text: 'Total loss / theft. If equipment is lost, stolen, or damaged beyond reasonable repair, you are liable for the full replacement value based on the current market price of an equivalent unit. You agree to:',
        bullets: [
          'Report theft or loss to local law enforcement within twenty-four (24) hours of discovery',
          'Provide FTU with a copy of the police report',
          'Cooperate fully with FTU\'s insurance carrier in any claim investigation',
        ],
      },
      {
        id: '5.5',
        text: 'Replacement values (current). For your reference:',
        bullets: [
          'Each 2014 Sea-Doo Spark 900 ACE: approximately $8,000',
          'Each 2026 Sea-Doo GTX Limited 325: approximately $22,000',
          'Trailers: approximately $1,500–$3,500 each',
        ],
        footer: 'Values are estimates; actual replacement cost will be determined at time of incident.',
      },
      { id: '5.6', text: 'Repair cost ceiling. For repairable damage, your liability is capped at the lesser of (a) the actual repair cost or (b) the replacement value of the damaged unit.' },
    ],
  },
  {
    number: 6,
    title: 'FUEL POLICY',
    clauses: [
      { id: '6.1', text: 'All rented Personal Watercraft (PWC) require 91-octane premium unleaded gasoline only. Use of any lower octane fuel, ethanol-blended fuel exceeding E10, or any other fuel type may damage the engine and constitutes a breach of this Agreement.' },
      { id: '6.2', text: 'Return condition. Equipment must be returned with a full tank of 91-octane gasoline.' },
      {
        id: '6.3',
        text: 'Fuel reimbursement if not returned full. If equipment is returned with less than a full tank, FTU will charge:',
        bullets: [
          'The actual cost of fuel needed to refill, PLUS',
          'A 20% service premium to cover staff time, transport, and convenience',
        ],
        footer: 'This charge will be deducted from your deposit or charged to your card-on-file under Section 2.2.',
      },
      { id: '6.4', text: 'Wrong fuel. If you fuel the equipment with the wrong octane or fuel type and damage results, you are liable for all repair costs as set forth in Section 5.' },
    ],
  },
  {
    number: 7,
    title: 'LATE RETURN',
    clauses: [
      { id: '7.1', text: 'The agreed return time is specified in your booking confirmation. The standard pickup is 8:00 AM at FTU\'s Farmington, UT location (or at the lake for white-glove deliveries); the standard return is 8:00 PM the same day or final rental day. Custom times may be agreed to at booking.' },
      {
        id: '7.2',
        text: 'Late return fees:',
        bullets: [
          'Up to 1 hour late: Grace period, no fee',
          'More than 1 hour, less than 4 hours late: $50/hour prorated',
          '4 hours or more late: Additional full-day rental rate applied based on the package booked',
          'Each subsequent calendar day late: Additional full-day rental rate per day',
        ],
      },
      {
        id: '7.3',
        text: 'Abandonment. If equipment is not returned within twenty-four (24) hours of the agreed return time, and FTU has been unable to reach you, FTU may, at our discretion:',
        bullets: [
          'Report the equipment as stolen to local law enforcement',
          'Treat the rental as a total loss and charge the full replacement value to your card-on-file (Section 5.4)',
          'Pursue civil and criminal remedies',
        ],
      },
      { id: '7.4', text: 'Communication. You must notify FTU as soon as possible — and in no case later than the agreed return time — if you anticipate being late. FTU may, at our sole discretion, extend the return time without penalty if conditions warrant.' },
    ],
  },
  {
    number: 8,
    title: 'EQUIPMENT USE RESTRICTIONS',
    clauses: [
      { id: '8.1', text: 'Designated water body only. The rented equipment may be operated only on the body of water specified in your booking confirmation. Transport to or operation on any other body of water is strictly prohibited and constitutes a material breach of this Agreement.' },
      { id: '8.2', text: 'No subletting or transfer. You may not assign, sublet, rent, or otherwise transfer your rights under this Agreement. Only persons identified to FTU as authorized operators may operate the equipment.' },
      { id: '8.3', text: 'No commercial use. The equipment may not be used for commercial purposes including but not limited to: paid passenger rides, photography for commercial sale, tournaments, races, instruction for compensation, or filming for commercial publication.' },
      {
        id: '8.4',
        text: 'Capacity limits. USCG-rated capacity strictly applies:',
        bullets: [
          'Sea-Doo Spark 2-up: Two (2) persons maximum per ski (four (4) total for the Spark Duo package)',
          'Sea-Doo GTX Limited 325: Three (3) persons maximum per ski (six (6) total for the GTX Limited Duo package)',
        ],
        footer: 'Exceeding these limits violates U.S. Coast Guard regulations and voids any insurance coverage.',
      },
      { id: '8.5', text: 'Personal flotation devices (PFDs). USCG-approved PFDs must be worn by all occupants whenever the engine is running. FTU provides PFDs in the sizes selected during booking. Use of non-FTU PFDs requires they be USCG-approved.' },
      { id: '8.6', text: 'Daylight operation only. Operation is restricted to between thirty (30) minutes after sunrise and thirty (30) minutes before sunset, per Utah law, unless equipment is specifically equipped with proper lighting and FTU provides written permission.' },
      {
        id: '8.7',
        text: 'Tow sports. Wakeboarding, tubing, and water skiing require:',
        bullets: [
          'A licensed observer on board the towing vessel (Utah law)',
          'Use of FTU-provided towables only, unless otherwise approved',
          'Adequate clearance from other vessels and shore',
        ],
      },
    ],
  },
  {
    number: 9,
    title: 'OPERATOR CONDUCT & SAFETY RULES',
    clauses: [
      { id: '9.1', text: 'No impairment. You and all operators must operate the equipment sober and undistracted. Operating while under the influence of alcohol, drugs (including legal marijuana, prescription medications that impair operation, and intoxicants of any kind), or while otherwise impaired is strictly prohibited. Operating while impaired is a serious offense under Utah Code §73-18-12, may result in criminal charges, and constitutes a material breach of this Agreement.' },
      {
        id: '9.2',
        text: 'Rules compliance. You will comply with all applicable laws and regulations, including but not limited to:',
        bullets: [
          'U.S. Coast Guard regulations',
          'Utah State Parks rules for the body of water in use',
          'Local marina, dock, and launch ramp rules',
          'AIS / quagga mussel decontamination requirements (Section 10)',
        ],
      },
      { id: '9.3', text: 'Distance and speed. You will maintain safe distances from other vessels, swimmers, docks, and shorelines, and will obey posted speed limits and no-wake zones.' },
      {
        id: '9.4',
        text: 'Incident reporting. You must immediately notify FTU of any:',
        bullets: [
          'Collision with another vessel, person, or fixed object',
          'Mechanical failure or warning indicator',
          'Injury to any person, however minor',
          'Damage to any property, FTU\'s or otherwise',
        ],
      },
      { id: '9.5', text: 'Boarding by FTU. FTU reserves the right to terminate the rental and recover the equipment at any time if you violate Section 9 in a manner that endangers persons or property. In such case, no refund is owed and you remain liable for all charges through that point.' },
    ],
  },
  {
    number: 10,
    title: 'AIS / QUAGGA MUSSEL COMPLIANCE',
    clauses: [
      { id: '10.1', text: 'You acknowledge that Lake Powell and certain other Utah waters are designated as quagga mussel-infested by the Utah Division of Wildlife Resources. Aquatic Invasive Species (AIS) violations carry both legal and financial consequences.' },
      {
        id: '10.2',
        text: 'Lake Powell rentals. Equipment rented for use at Lake Powell is subject to:',
        bullets: [
          'A $200 decontamination fee (charged at booking)',
          'A mandatory thirty (30) day quarantine period in which the equipment may not enter any other body of water',
          'Required decontamination upon return, performed by FTU',
        ],
      },
      { id: '10.3', text: 'No cross-water transport. You shall not transport the rented equipment from one body of water to another during the rental period. Equipment must remain at the designated lake from delivery/pickup to return.' },
      { id: '10.4', text: 'Inspection cooperation. You agree to cooperate with all AIS inspections by state, federal, or local authorities, including pre-departure inspections required at Lake Powell exits.' },
      {
        id: '10.5',
        text: 'Violation consequences. Violation of this section may result in:',
        bullets: [
          'Civil penalties from the State of Utah (up to $5,000 per offense)',
          'Criminal charges in certain circumstances',
          'Full liability to FTU for any damages, fines, decontamination costs, or business loss arising from your violation',
        ],
      },
    ],
  },
  {
    number: 11,
    title: 'INDEMNIFICATION',
    clauses: [
      {
        id: '11.1',
        text: 'Renter indemnification of FTU. You agree to defend, indemnify, and hold harmless TW Assets LLC, Full Throttle Utah, and their owners, members, employees, contractors, and agents (collectively, "FTU Parties") from and against any and all claims, damages, losses, liabilities, costs, and expenses — including reasonable attorney\'s fees — arising from:',
        bullets: [
          'Your operation or use of the rented equipment',
          'Any breach of this Agreement by you',
          'Injury to or death of any person (including yourself or your guests) caused by your operation',
          'Damage to property of third parties caused by your operation',
          'Your violation of any law or regulation',
          'Claims by passengers, guests, or third parties to whom you provided rides or use of the equipment',
        ],
      },
      { id: '11.2', text: 'Survival. Your indemnification obligations under this Section 11 survive termination or expiration of this Agreement.' },
    ],
  },
  {
    number: 12,
    title: 'DEFAULT, REMEDIES & GOVERNING LAW',
    clauses: [
      {
        id: '12.1',
        text: 'Default events. You are in default of this Agreement if you:',
        bullets: [
          'Fail to return the equipment at the agreed time',
          'Fail to pay any amount due under this Agreement',
          'Breach any term of this Agreement materially',
          'Provide false information at booking',
          'Operate the equipment in violation of any law',
        ],
      },
      {
        id: '12.2',
        text: 'Remedies. Upon default, FTU may, without limitation:',
        bullets: [
          'Charge any amount owed to your card-on-file under Section 2.2',
          'Refer unpaid balances to collections, including credit bureau reporting',
          'Pursue civil action for damages',
          'Pursue criminal charges where applicable (theft, abandonment, willful damage)',
          'Recover the equipment by any lawful means',
        ],
      },
      { id: '12.3', text: 'Attorney\'s fees. In any action arising from your default, you agree to pay FTU\'s reasonable attorney\'s fees and costs of collection, whether or not litigation is commenced.' },
      { id: '12.4', text: 'Governing law and venue. This Agreement is governed by the laws of the State of Utah without regard to its conflicts of law principles. Any dispute arising from this Agreement shall be resolved in the state or federal courts located in Davis County, Utah, and you consent to the personal jurisdiction of those courts.' },
      { id: '12.5', text: 'Severability. If any provision of this Agreement is found unenforceable, the remaining provisions remain in full force.' },
      { id: '12.6', text: 'Entire agreement. This Agreement, together with the Liability Waiver and the policies posted at fullthrottleutah.com/terms, fullthrottleutah.com/privacy-policy, and fullthrottleutah.com/cancellation-policy, constitutes the entire agreement between you and FTU regarding this rental and supersedes all prior discussions and agreements.' },
    ],
  },
  {
    number: 13,
    title: 'ELECTRONIC SIGNATURE ACKNOWLEDGMENT',
    clauses: [
      {
        id: '13.1',
        text: 'By clicking the acceptance checkbox(es) and providing your electronic signature on the booking page, you acknowledge and agree that:',
        bullets: [
          'Your electronic signature has the same legal effect as a handwritten signature under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act, 15 U.S.C. §7001 et seq.) and the Utah Uniform Electronic Transactions Act',
          'You have had the opportunity to read this entire Agreement before signing',
          'You understand the obligations and rights set forth herein',
          'You are of legal age (18+) and have legal capacity to enter into this Agreement',
          'You are entering this Agreement voluntarily and without duress',
        ],
      },
      { id: '13.2', text: 'You may request a copy of this signed Agreement at any time by emailing bookings@fullthrottleutah.com.' },
    ],
  },
];

// ─── Signature block checkboxes ─────────────────────────────────────────────
// These are the 5 acknowledgment checkboxes shown at the bottom of the
// agreement, matching the SIGNATURE block in the legal document.
export const AGREEMENT_CHECKBOXES = [
  { id: 'readAll',             label: 'I have read and agree to Sections 1-13 of this Rental Agreement' },
  { id: 'age18',               label: 'I am at least 18 years old' },
  { id: 'infoTrue',            label: 'I confirm the information I provided at booking is true and accurate' },
  { id: 'cardOnFile',          label: 'I authorize FTU to charge my card-on-file for amounts owed under this Agreement' },
  { id: 'separateFromWaiver',  label: 'I understand this Agreement is separate from the Liability Waiver, which I have also signed' },
];

// ─── Cross-reference appendix ────────────────────────────────────────────────
export const AGREEMENT_APPENDIX = {
  title: 'APPENDIX A — Cross-References to Existing Policies',
  intro: 'This Agreement is intended to operate consistently with:',
  references: [
    'fullthrottleutah.com/terms — Website terms of use and SMS communication terms',
    'fullthrottleutah.com/privacy-policy — Customer data and privacy practices',
    'fullthrottleutah.com/cancellation-policy — Public-facing cancellation policy (referenced in Section 3)',
    'Liability Waiver — Separate document covering assumption of risk, signed at booking',
  ],
  conflict: 'In the event of conflict between this Agreement and the above policies, this Agreement governs as to the matters covered herein.',
};
