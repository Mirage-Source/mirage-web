import type { Scene } from "../types.ts";

// A company of four hundred. The exposed-SSH path is the one MIRAGE watches
// for a living, so it cites the sensor's live figures.
export const enterprise: Scene = {
  id: "enterprise",
  eyebrow: "Level two · an organisation",
  title: "A company of four hundred",
  intro:
    "Four hundred people, one network, a mail system in the cloud, a customer database, backups, and a few thousand ways in that nobody has counted. The attacker does not need most of them.",
  root: "idle",
  cta: "Break in",
  ctaNode: "office",
  camera: { position: [16, 12, 25], target: [3, 2, -4] },
  nodes: [
    { id: "office", kind: "building", at: [0, 0, 0], label: "the company" },
    { id: "finance", kind: "figure", at: [-3.2, 0, 4.2], label: "accounts payable" },
    { id: "exec", kind: "figure", at: [3.4, 0, 4.6], label: "the chief executive" },
    { id: "dev", kind: "figure", at: [0.4, 0, 5.2], label: "a developer" },
    { id: "vpn", kind: "router", at: [-7, 0, -3], label: "vpn gateway" },
    { id: "testbox", kind: "server", at: [7, 0, -5], label: "a test server from 2022" },
    { id: "db", kind: "rack", at: [3, 0, -10], label: "customer database" },
    { id: "backup", kind: "rack", at: [-4, 0, -11], label: "backups" },
    { id: "saas", kind: "globe", at: [-13, 1, -8], label: "cloud mail & drive", scale: 0.8 },
    { id: "net", kind: "globe", at: [10, 2, -13], label: "the internet", scale: 0.9 },
    { id: "supplier", kind: "server", at: [-11, 0, -6], label: "a real supplier", initial: "hidden" },
    { id: "contractor", kind: "laptop", at: [-10, 0, 3], label: "the heating contractor", initial: "hidden" },
    { id: "homepc", kind: "laptop", at: [8, 0, 6], label: "an employee's home laptop", initial: "hidden" },
    { id: "broker", kind: "cards", at: [12, 0, 3], label: "an access broker", initial: "hidden" },
    { id: "botnet", kind: "swarm", at: [13, 0, -8], label: "a botnet", initial: "hidden" },
    { id: "attacker", kind: "attacker", at: [13.2, 0, -3.5], label: "the attacker", initial: "hidden" },
    { id: "leak", kind: "cards", at: [18, 0, -9], label: "the leak site", initial: "hidden" },
  ],
  assets: [
    { id: "customers", label: "customer records", home: "db" },
    { id: "mail", label: "mailboxes", home: "saas" },
    { id: "code", label: "source code", home: "testbox" },
    { id: "payroll", label: "payroll", home: "office" },
    { id: "backups", label: "backups", home: "backup" },
  ],
  steps: {
    idle: {
      id: "idle",
      title: "Nothing is wrong yet",
      caption:
        "Staff work through the cloud mail system and a VPN. The database and the backups sit inside. A test server someone set up two years ago is still on, facing the internet, and nobody remembers it.",
      effects: [
        { type: "flow", from: "office", to: "saas", label: "mail", persist: true },
        { type: "flow", from: "testbox", to: "net", label: "port 22", persist: true },
      ],
      choices: [{ label: "Break in", to: "how" }],
    },
    how: {
      id: "how",
      title: "How do you get in?",
      caption:
        "The attacker is not choosing this company. They are choosing a method, and the method chooses whichever company it works on first.",
      effects: [
        { type: "state", node: "attacker", state: "hot" },
        { type: "camera", look: "office", zoom: 1 },
      ],
      choices: [
        { label: "Knock on every door", to: "ssh" },
        { label: "Send one email", to: "bec" },
        { label: "Come in through a supplier", to: "supply" },
        { label: "Buy a way in", to: "buy" },
      ],
    },

    // ── path A: exposed SSH (the one the sensor watches) ──
    ssh: {
      id: "ssh",
      title: "Every address, every hour",
      caption:
        "A botnet touches every address on the internet in well under an hour, asking one question: is anything listening? The forgotten test server answers on port 22.",
      detail: "nobody targeted the company; the scan found a door and the door had a name",
      live: "MIRAGE's own port 22 was answered {sessions_7d} times in the last seven days, from {unique_ips} distinct addresses in total.",
      effects: [
        { type: "state", node: "botnet", state: "hot" },
        { type: "state", node: "testbox", state: "hot" },
        { type: "flow", from: "botnet", to: "testbox", via: ["net"], label: "is anyone there?" },
        { type: "camera", look: "testbox", zoom: 1.1 },
      ],
      choices: [{ label: "Try the usual passwords", to: "ssh-brute" }],
    },
    "ssh-brute": {
      id: "ssh-brute",
      title: "The same list everyone uses",
      caption:
        "Thousands of username and password pairs, the same public list every botnet carries. Most are refused. The test server was set up in a hurry, with a password from that list.",
      detail: "a machine can be tried tens of thousands of times a day and never complain",
      live: "On MIRAGE the most-tried usernames are {top_usernames}. The list has not changed in years.",
      effects: [
        { type: "flow", from: "botnet", to: "testbox", via: ["net"], label: "root · admin · test …" },
        { type: "flow", from: "testbox", to: "attacker", via: ["net"], label: "one worked", persist: true },
      ],
      choices: [{ label: "Inside the box", to: "ssh-inside" }],
    },
    "ssh-inside": {
      id: "ssh-inside",
      title: "The first minutes inside",
      caption:
        "Who else is logged in, what is this machine, what can it reach, is anything worth taking. It is the same short script every time, run by a program, and it is exactly what a honeypot is built to record.",
      detail: "reconnaissance first, always: uname, whoami, ls, cat, then the network",
      live: "The sensor has recorded {total_sessions} sessions like this one, and {shell_reached} of them got as far as a shell.",
      effects: [
        { type: "copy", asset: "code", to: "attacker" },
        { type: "flow", from: "attacker", to: "testbox", via: ["net"], label: "uname · whoami · ls" },
        { type: "camera", look: "testbox", zoom: 1.2 },
      ],
      choices: [{ label: "Follow the credentials", to: "ssh-pivot" }],
    },
    "ssh-pivot": {
      id: "ssh-pivot",
      title: "A key left in the box",
      caption:
        "The test server holds a config file with the database password, written there two years ago so a demo would work. From here the customer database is one hop away, on the inside of the network.",
      detail: "the perimeter was crossed by the forgotten machine; everything inside trusted it",
      effects: [
        { type: "state", node: "db", state: "hot" },
        { type: "flow", from: "testbox", to: "db", label: "db password" },
        { type: "camera", look: "db", zoom: 1.1 },
      ],
      choices: [{ label: "Take it, then lock it", to: "ransom" }],
    },

    // ── path B: business email compromise ──
    bec: {
      id: "bec",
      title: "Read what they publish",
      caption:
        "Who runs finance, who the chief executive is, which supplier they thank in a press release, when the executive is travelling. All of it is on the company's own site and on social media.",
      detail: "no system is touched; the reconnaissance is reading",
      effects: [
        { type: "state", node: "supplier", state: "hot" },
        { type: "state", node: "finance", state: "hot" },
        { type: "state", node: "exec", state: "hot" },
        { type: "flow", from: "office", to: "attacker", via: ["net"], label: "who · what · when" },
        { type: "camera", look: "finance", zoom: 1.1 },
      ],
      choices: [{ label: "Write the email", to: "bec-mail" }],
    },
    "bec-mail": {
      id: "bec-mail",
      title: "New bank details",
      caption:
        "An email to accounts payable, from a domain one letter off the real supplier's: our bank has changed, please use these details for the outstanding invoice. The invoice is real. Only the account is not.",
      detail: "the message is well written, references a real order, and arrives on a Friday afternoon",
      effects: [
        { type: "flow", from: "attacker", to: "finance", via: ["net", "saas"], label: "\"updated details\"" },
        { type: "flow", from: "supplier", to: "office", label: "the real invoice", persist: true },
      ],
      choices: [{ label: "Or steal a mailbox instead", to: "bec-mailbox" }, { label: "The payment goes out", to: "bec-paid" }],
    },
    "bec-mailbox": {
      id: "bec-mailbox",
      title: "One mailbox, quietly",
      caption:
        "A sign-in page that looks like the mail system's gets the finance manager's password and, minutes later, a rule is added to their mailbox: anything mentioning invoices is forwarded out and marked read.",
      detail: "the attacker now reads the thread in real time and replies from inside it",
      effects: [
        { type: "state", node: "saas", state: "hot" },
        { type: "flow", from: "finance", to: "attacker", via: ["saas", "net"], label: "password" },
        { type: "flow", from: "saas", to: "attacker", via: ["net"], label: "forwarded mail", persist: true },
        { type: "copy", asset: "mail", to: "attacker" },
        { type: "camera", look: "saas", zoom: 1.05 },
      ],
      choices: [{ label: "The payment goes out", to: "bec-paid" }],
    },
    "bec-paid": {
      id: "bec-paid",
      title: "Paid, on time, to the wrong account",
      caption:
        "The transfer clears. The real supplier chases the invoice three weeks later, and that is the first anyone knows. The money has been moved on through three banks by then.",
      detail: "no malware, no exploit, one email and one changed field",
      effects: [
        { type: "copy", asset: "payroll", to: "attacker" },
        { type: "flow", from: "office", to: "attacker", via: ["net"], label: "the transfer" },
        { type: "camera", look: "attacker", zoom: 1.1 },
      ],
      choices: [],
      lesson:
        "What would have changed it: a phone call to a known number before any bank detail changes, sign-in that needs a hardware key or a passkey, and an alert when a mailbox grows a forwarding rule.",
    },

    // ── path C: supply chain ──
    supply: {
      id: "supply",
      title: "Attack the smaller company",
      caption:
        "The heating contractor has a VPN account so they can check the building's systems remotely. They are six people with no security team. That account is the company's front door, held by someone else.",
      detail: "trust was extended to a supplier; the supplier's security became the company's",
      effects: [
        { type: "state", node: "contractor", state: "hot" },
        { type: "flow", from: "attacker", to: "contractor", via: ["net"], label: "phish · malware" },
        { type: "camera", look: "contractor", zoom: 1.05 },
      ],
      choices: [{ label: "Use their VPN account", to: "supply-vpn" }],
    },
    "supply-vpn": {
      id: "supply-vpn",
      title: "A legitimate sign-in",
      caption:
        "The contractor's password and one-time code, captured from their laptop, open the VPN. Every log records a normal sign-in by a known account. Nobody is alerted because nothing has gone wrong.",
      detail: "the gateway did its job; it was asked by the right account with the right code",
      effects: [
        { type: "state", node: "vpn", state: "hot" },
        { type: "flow", from: "contractor", to: "vpn", label: "vpn sign-in", persist: true },
        { type: "flow", from: "vpn", to: "office", label: "inside" },
        { type: "camera", look: "vpn", zoom: 1.1 },
      ],
      choices: [{ label: "Move sideways", to: "supply-lateral" }],
    },
    "supply-lateral": {
      id: "supply-lateral",
      title: "From the heating to the directory",
      caption:
        "The contractor's account can reach the building controls, which sit on the same network as everything else. From there the attacker collects passwords from machine after machine until one of them belongs to an administrator.",
      detail: "a flat network means every door opens onto the same corridor",
      effects: [
        { type: "state", node: "db", state: "hot" },
        { type: "state", node: "backup", state: "hot" },
        { type: "flow", from: "office", to: "db", label: "admin" },
        { type: "flow", from: "office", to: "backup", label: "admin" },
        { type: "camera", look: "db", zoom: 1.05 },
      ],
      choices: [{ label: "Take it, then lock it", to: "ransom" }],
    },

    // ── path D: buy access ──
    buy: {
      id: "buy",
      title: "Someone already did the work",
      caption:
        "An employee's home laptop caught an infostealer months ago, from a cracked game. It took every saved password and every browser cookie, including the ones that keep them signed into work.",
      detail: "the company was never touched; the theft happened in a bedroom",
      effects: [
        { type: "state", node: "homepc", state: "hot" },
        { type: "state", node: "broker", state: "hot" },
        { type: "flow", from: "homepc", to: "broker", via: ["net"], label: "cookies · passwords", persist: true },
        { type: "camera", look: "homepc", zoom: 1.05 },
      ],
      choices: [{ label: "Buy the logs", to: "buy-logs" }],
    },
    "buy-logs": {
      id: "buy-logs",
      title: "Ten dollars",
      caption:
        "The stolen logs are sold in bulk, searchable by company domain. Access to this company, in the form of a signed-in session cookie, costs about the price of lunch.",
      detail: "an access broker sells the way in; a different group walks through it",
      effects: [
        { type: "flow", from: "broker", to: "attacker", label: "$10" },
        { type: "camera", look: "broker", zoom: 1.05 },
      ],
      choices: [{ label: "Replay the session", to: "buy-replay" }],
    },
    "buy-replay": {
      id: "buy-replay",
      title: "Already signed in",
      caption:
        "The cookie is placed in the attacker's browser, and the cloud drive opens as the employee. No password is typed, so no one-time code is asked for. The sign-in happened weeks ago, on the right laptop.",
      detail: "a session cookie is a signed note saying 'this person already proved who they are'",
      effects: [
        { type: "state", node: "saas", state: "hot" },
        { type: "flow", from: "attacker", to: "saas", via: ["net"], label: "the cookie" },
        { type: "copy", asset: "mail", to: "attacker" },
        { type: "camera", look: "saas", zoom: 1.05 },
      ],
      choices: [{ label: "Take it, then lock it", to: "ransom" }],
    },

    // ── convergent outcome ──
    ransom: {
      id: "ransom",
      title: "Take it, then lock it",
      caption:
        "The customer database leaves first, quietly, over days, inside ordinary-looking traffic. Then the backups are deleted, then everything is encrypted, and the note arrives on a Monday morning: pay, or the database is published on Friday.",
      detail: "exfiltrate, destroy the backups, encrypt; the order matters and it is always this order",
      effects: [
        { type: "copy", asset: "customers", to: "attacker" },
        { type: "copy", asset: "backups", to: "attacker" },
        { type: "state", node: "leak", state: "hot" },
        { type: "state", node: "backup", state: "dark" },
        { type: "state", node: "office", state: "dark" },
        { type: "state", node: "db", state: "dark" },
        { type: "flow", from: "db", to: "attacker", via: ["net"], label: "customer records", persist: true },
        { type: "flow", from: "attacker", to: "leak", label: "friday" },
        { type: "copy", asset: "customers", to: "leak" },
        { type: "camera", look: "attacker", zoom: 0.9 },
      ],
      choices: [],
      lesson:
        "What would have changed it: an inventory that knew the test server existed, keys instead of passwords on anything facing the internet, a network where the heating cannot see the database, and backups that nothing on the network can delete. MIRAGE exists to watch the first of these happen, thousands of times a week, to a machine that was put there on purpose.",
    },
  },
};
