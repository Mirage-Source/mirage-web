import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normaliseSession, parseProtocol } from "./session-doc.ts";

const sshDoc = {
  session_id: "s1",
  schema_version: "1.1",
  node_id: "Ubuntu",
  protocol: "ssh",
  network: { client_ip: "203.0.113.5", client_port: 40000, server_port: 2222, ssh_client_banner: "SSH-2.0-Go", ingress_source: "direct", proxy_node_id: "" },
  timing: { start_ms: 1000, end_ms: 4000, duration_ms: 3000 },
  outcome: "clean_disconnect",
  auth_attempts: [{ timestamp_ms: 1000, method: "password", username: "root", credential: "admin", success: true }],
  commands: [{ event_id: "c1", sequence_number: 0, timestamp_ms: 2000, inter_command_delay_ms: null, raw_input_b64: "dW5hbWU=", parsed_command: "uname", parsed_args: [], working_directory: "/root", response: "Linux", exit_code: 0, response_source: "hardcoded", deception_action: null }],
  bait_interactions: [{ event_id: "b1", timestamp_ms: 2000, bait_id: "x", bait_type: "credential", access_type: "read", triggered_by_command_event_id: "c1" }],
  intelligence: { attacker_class: null, classifier_confidence: null, cluster_id: null, mitre_techniques: null, session_summary: null, stix_bundle: null, severity: null, recommended_actions: null },
};

describe("normaliseSession", () => {
  it("flattens network and timing and renames bait_interactions", () => {
    const d = normaliseSession(sshDoc);
    assert.equal(d.client_ip, "203.0.113.5");
    assert.equal(d.client_port, 40000);
    assert.equal(d.server_port, 2222);
    assert.equal(d.ssh_client_banner, "SSH-2.0-Go");
    assert.equal(d.start_ms, 1000);
    assert.equal(d.end_ms, 4000);
    assert.equal(d.duration_ms, 3000);
    assert.equal(d.bait_events.length, 1);
    assert.equal(d.command_count, 1);
    assert.equal(d.bait_hit_count, 1);
    assert.equal(d.telnet, null);
  });

  it("turns Go's null slices into empty arrays", () => {
    const d = normaliseSession({ ...sshDoc, commands: null, auth_attempts: null, bait_interactions: null });
    assert.deepEqual(d.commands, []);
    assert.deepEqual(d.auth_attempts, []);
    assert.deepEqual(d.bait_events, []);
    assert.equal(d.command_count, 0);
  });

  it("carries telnet negotiation through", () => {
    const telnet = { negotiated: true, client_options: [24, 31], terminal_type: "XTERM", window_width: 80, window_height: 24 };
    const d = normaliseSession({ ...sshDoc, protocol: "telnet", network: { ...sshDoc.network, ssh_client_banner: "" }, telnet });
    assert.equal(d.protocol, "telnet");
    assert.deepEqual(d.telnet, telnet);
  });

  it("passes an already-flat fixture through unchanged", () => {
    const flat = normaliseSession(sshDoc);
    assert.deepEqual(normaliseSession(flat), flat);
  });
});

describe("parseProtocol", () => {
  it("defaults to ssh and accepts telnet", () => {
    assert.equal(parseProtocol(null), "ssh");
    assert.equal(parseProtocol(""), "ssh");
    assert.equal(parseProtocol("ssh"), "ssh");
    assert.equal(parseProtocol("telnet"), "telnet");
  });
  it("falls back to ssh for anything else", () => {
    assert.equal(parseProtocol("rdp"), "ssh");
    assert.equal(parseProtocol("telnet&x=1"), "ssh");
  });
});
