import type { Scene } from "../types.ts";

// One person, one phone. Every path here is a mechanism that is well
// documented in public breach reporting; the captions describe what happens,
// not how to do it.
export const phone: Scene = {
  id: "phone",
  eyebrow: "Level one · one person",
  title: "One person, one phone",
  intro:
    "He is checking his bank balance on the bus. His phone holds his contacts, his photos, the one-time codes his bank texts him, and the sessions that keep him signed in. Nothing is wrong yet.",
  root: "idle",
  cta: "Steal his data",
  ctaNode: "phone",
  camera: { position: [12.5, 8.5, 19], target: [2, 1.2, -4] },
  nodes: [
    { id: "him", kind: "figure", at: [0, 0, 0], label: "him" },
    { id: "phone", kind: "phone", at: [0.36, 1.02, 0.34], scale: 0.42 },
    { id: "cafe", kind: "router", at: [4, 0, 3], label: "café wi-fi", initial: "dim" },
    { id: "tower", kind: "tower", at: [-4, 0, -8], label: "cell tower", scale: 0.8 },
    { id: "net", kind: "globe", at: [5, 1.5, -10], label: "the internet", scale: 0.9 },
    { id: "bank", kind: "server", at: [10, 0, -14], label: "his bank" },
    { id: "carrier", kind: "server", at: [-9, 0, -12], label: "his carrier" },
    { id: "breach", kind: "cards", at: [-9, 0, -3], label: "a breach from years ago", initial: "hidden" },
    { id: "store", kind: "cards", at: [6.5, 0, 0.5], label: "a download outside the store", initial: "hidden" },
    { id: "attacker", kind: "attacker", at: [10, 0, -5], label: "the attacker", initial: "hidden" },
    { id: "market", kind: "cards", at: [14, 0, -10], label: "the market", initial: "hidden" },
  ],
  assets: [
    { id: "codes", label: "one-time codes", home: "phone" },
    { id: "session", label: "bank session", home: "phone" },
    { id: "passwords", label: "saved passwords", home: "phone" },
    { id: "contacts", label: "contacts", home: "phone" },
    { id: "photos", label: "photos", home: "phone" },
  ],
  steps: {
    idle: {
      id: "idle",
      title: "Nothing is wrong yet",
      caption:
        "The phone talks to the bank through the cell tower and the internet. Every hop is encrypted. The attacker is not in this picture, and never needs to be near him.",
      effects: [{ type: "flow", from: "phone", to: "bank", via: ["tower", "net"], label: "balance", persist: true }],
      choices: [{ label: "Steal his data", to: "how" }],
    },
    how: {
      id: "how",
      title: "How do you get in?",
      caption:
        "Somewhere far away, someone opens a laptop. None of the ways in involve breaking the encryption. They all involve him, his carrier, or the things he installs.",
      effects: [
        { type: "state", node: "attacker", state: "hot" },
        { type: "camera", look: "him", zoom: 1 },
      ],
      choices: [
        { label: "Text him a link", to: "smish" },
        { label: "Wait for him on public wi-fi", to: "wifi" },
        { label: "Become him at the carrier", to: "sim" },
        { label: "Get him to install something", to: "app" },
      ],
    },

    // ── path A: smishing ──
    smish: {
      id: "smish",
      title: "A message arrives",
      caption:
        "It looks like it came from the courier: a parcel is held, confirm your details. The link goes to a page the attacker built that morning. Thousands of people got the same text.",
      detail: "one message · sent to a list · a lookalike domain registered hours earlier",
      effects: [
        { type: "state", node: "phone", state: "hot" },
        { type: "flow", from: "attacker", to: "phone", via: ["net", "tower"], label: "sms" },
      ],
      choices: [{ label: "He taps it", to: "smish-page" }],
    },
    "smish-page": {
      id: "smish-page",
      title: "A page that looks right",
      caption:
        "It is a copy of the bank's sign-in page, pixel for pixel. What he types is delivered to the attacker, who forwards it to the real bank so that nothing looks wrong to him.",
      detail: "the attacker sits between him and the bank, relaying both directions",
      effects: [
        { type: "flow", from: "phone", to: "attacker", via: ["tower", "net"], label: "username · password" },
        { type: "flow", from: "attacker", to: "bank", label: "relayed", persist: true },
        { type: "copy", asset: "passwords", to: "attacker" },
      ],
      choices: [{ label: "The bank asks for a code", to: "smish-otp" }],
    },
    "smish-otp": {
      id: "smish-otp",
      title: "The code proves it is him",
      caption:
        "The bank texts him a one-time code to prove the sign-in is really his. He types it into the fake page. It proves the sign-in is his, to the attacker, who is the one signing in.",
      detail: "a code sent by text authenticates whoever holds it in the next sixty seconds",
      effects: [
        { type: "flow", from: "bank", to: "phone", via: ["net", "tower"], label: "code", persist: true },
        { type: "flow", from: "phone", to: "attacker", via: ["tower", "net"], label: "code" },
        { type: "copy", asset: "codes", to: "attacker" },
        { type: "copy", asset: "session", to: "attacker" },
        { type: "camera", look: "attacker", zoom: 1.15 },
      ],
      choices: [{ label: "Where it ends up", to: "sold" }],
    },

    // ── path B: public wi-fi ──
    wifi: {
      id: "wifi",
      title: "A network with a familiar name",
      caption:
        "The café's wi-fi, or a hotspot named exactly like it. His phone remembers the name and joins on its own. Everything he does now passes through equipment the attacker controls.",
      detail: "a phone that has joined a network once will join anything with the same name",
      effects: [
        { type: "state", node: "cafe", state: "hot" },
        { type: "state", node: "phone", state: "hot" },
        { type: "flow", from: "phone", to: "cafe", label: "joined", persist: true },
        { type: "flow", from: "cafe", to: "attacker", label: "everything", persist: true },
        { type: "camera", look: "cafe", zoom: 1.1 },
      ],
      choices: [{ label: "What can they see?", to: "wifi-meta" }],
    },
    "wifi-meta": {
      id: "wifi-meta",
      title: "Less than you fear, more than you think",
      caption:
        "Most of the traffic is encrypted, so the attacker sees where he goes rather than what he says: which bank, which apps, which contacts, at what hour. Habits are data too.",
      detail: "destinations, timing and volume leak even when contents do not",
      effects: [
        { type: "flow", from: "phone", to: "attacker", via: ["cafe"], label: "who · when · where" },
        { type: "copy", asset: "contacts", to: "attacker" },
      ],
      choices: [{ label: "Then the sign-in page", to: "wifi-portal" }],
    },
    "wifi-portal": {
      id: "wifi-portal",
      title: "Sign in to use the wi-fi",
      caption:
        "A page appears before anything will load: sign in with your email to continue. It is the attacker's page, and it is the one place on this network where he types a password in the clear.",
      detail: "the captive portal is the only page the network itself is allowed to put in front of him",
      effects: [
        { type: "flow", from: "phone", to: "attacker", via: ["cafe"], label: "email · password" },
        { type: "copy", asset: "passwords", to: "attacker" },
        { type: "camera", look: "attacker", zoom: 1.15 },
      ],
      choices: [{ label: "Where it ends up", to: "sold" }],
    },

    // ── path C: sim swap ──
    sim: {
      id: "sim",
      title: "Start with what already leaked",
      caption:
        "Nothing here is taken from him. His name, number, date of birth and old address were in a company's database that leaked years ago, and they are still for sale.",
      detail: "breached records outlive the passwords in them by a decade",
      effects: [
        { type: "state", node: "breach", state: "hot" },
        { type: "flow", from: "breach", to: "attacker", label: "name · dob · address", persist: true },
        { type: "camera", look: "breach", zoom: 1.05 },
      ],
      choices: [{ label: "Call the carrier", to: "sim-swap" }],
    },
    "sim-swap": {
      id: "sim-swap",
      title: "A lost phone, apparently",
      caption:
        "The attacker phones the carrier as him: lost my phone, please move my number to this new SIM. They answer the security questions with the leaked answers. His phone drops to no service.",
      detail: "the carrier's process is designed for a real customer with a real lost phone",
      effects: [
        { type: "flow", from: "attacker", to: "carrier", via: ["net"], label: "\"it's me\"" },
        { type: "state", node: "phone", state: "dark" },
        { type: "flow", from: "carrier", to: "attacker", via: ["tower"], label: "his number", persist: true },
        { type: "camera", look: "carrier", zoom: 1.05 },
      ],
      choices: [{ label: "Forgot password", to: "sim-reset" }],
    },
    "sim-reset": {
      id: "sim-reset",
      title: "Every reset goes to the wrong phone",
      caption:
        "Forgot my password on his email. The reset code is texted to his number, which now rings on the attacker's desk. Email first, then the bank, then everything that resets by email.",
      detail: "the number was the root of trust; whoever holds it holds the rest",
      effects: [
        { type: "flow", from: "bank", to: "attacker", via: ["net", "tower"], label: "reset code" },
        { type: "copy", asset: "codes", to: "attacker" },
        { type: "copy", asset: "session", to: "attacker" },
        { type: "copy", asset: "passwords", to: "attacker" },
        { type: "camera", look: "attacker", zoom: 1.15 },
      ],
      choices: [{ label: "Where it ends up", to: "sold" }],
    },

    // ── path D: malicious app ──
    app: {
      id: "app",
      title: "A free app that does a bit more",
      caption:
        "A phone cleaner, a modded game, a premium app for free, installed from a link rather than the store. It asks for accessibility permission so it can 'work properly'. He grants it.",
      detail: "accessibility permission was built to read the screen for people who cannot see it",
      effects: [
        { type: "state", node: "store", state: "hot" },
        { type: "state", node: "phone", state: "hot" },
        { type: "flow", from: "store", to: "phone", via: ["net", "tower"], label: "install" },
        { type: "camera", look: "store", zoom: 1.05 },
      ],
      choices: [{ label: "What it reads", to: "app-read" }],
    },
    "app-read": {
      id: "app-read",
      title: "It reads whatever is on screen",
      caption:
        "Every notification, every text, every code, every password as he types it. The app sends them home quietly, batched, at night, alongside all the other traffic.",
      detail: "it never needs to break into anything; it watches him unlock it",
      effects: [
        { type: "flow", from: "phone", to: "attacker", via: ["tower", "net"], label: "screen · keys · texts", persist: true },
        { type: "copy", asset: "codes", to: "attacker" },
        { type: "copy", asset: "passwords", to: "attacker" },
        { type: "copy", asset: "contacts", to: "attacker" },
      ],
      choices: [{ label: "Then the bank app", to: "app-overlay" }],
    },
    "app-overlay": {
      id: "app-overlay",
      title: "A screen on top of the screen",
      caption:
        "When he opens the bank, the app draws its own sign-in over the real one. Same logo, same layout. He signs into the attacker's window, and the real app opens behind it as if nothing happened.",
      detail: "an overlay is just a window allowed to sit above the others",
      effects: [
        { type: "flow", from: "phone", to: "attacker", via: ["tower", "net"], label: "bank sign-in" },
        { type: "copy", asset: "session", to: "attacker" },
        { type: "camera", look: "attacker", zoom: 1.15 },
      ],
      choices: [{ label: "Where it ends up", to: "sold" }],
    },

    // ── convergent outcome ──
    sold: {
      id: "sold",
      title: "Where it ends up",
      caption:
        "The money moves first, inside the minute the code is valid. Then the rest is sorted and sold: his passwords to whoever wants to try them elsewhere, his contacts as the next list of people to text.",
      detail: "he is not the target; he is one row in a spreadsheet of targets",
      effects: [
        { type: "state", node: "market", state: "hot" },
        { type: "state", node: "him", state: "dim" },
        { type: "flow", from: "attacker", to: "market", label: "sold" },
        { type: "copy", asset: "passwords", to: "market" },
        { type: "copy", asset: "contacts", to: "market" },
        { type: "camera", look: "market", zoom: 0.95 },
      ],
      choices: [],
      lesson:
        "What would have changed it: a passkey instead of a texted code, a password manager that refuses to fill a lookalike domain, a carrier PIN, and nothing installed from outside the store. None of it is exotic; all of it is a default nobody set.",
    },
  },
};
