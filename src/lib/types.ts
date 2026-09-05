export interface IPCounts {
  ip: string;
  count: number;
}

export interface UsernameCounts {
  username: string;
  count: number;
}

export interface PasswordCounts {
  password: string;
  count: number;
}

export interface CredentialCounts {
  username: string;
  password: string;
  count: number;
}

export interface BannerCounts {
  banner: string;
  count: number;
}

export interface CoordinatedIPGroup {
  count: number;
  ips: string[];
  username: string;
  credential: string;
  ssh_client_banner: string;
  window_start_ms: number;
}

export interface HourlyDistribution {
  hour: number;
  count: number;
}

export interface HoneypotStats {
  total_sessions: number;
  unique_ips: number;
  sessions_last_24h: number;
  sessions_last_7d: number;
  top_ips: IPCounts[];
  top_usernames: UsernameCounts[];
  top_passwords: PasswordCounts[];
  top_credentials: CredentialCounts[];
  ssh_banners: BannerCounts[];
  coordinated_ips: CoordinatedIPGroup[];
  hourly_distribution: HourlyDistribution[];
}

export interface SessionSummary {
  session_id: string;
  client_ip: string;
  outcome: string;
  command_count: number;
  start_ms: number;
  duration_ms: number | null;
  ssh_banner: string;
}

export interface SessionsResponse {
  total: number;
  limit: number;
  offset: number;
  sessions: SessionSummary[];
}

export type AuthMethod = "password" | "publickey";

export interface AuthAttempt {
  timestamp_ms: number;
  method: AuthMethod;
  username: string;
  credential: string;
  success: boolean;
}

export type ResponseSource = "hardcoded" | "llm" | "bait_triggered" | "no_response";

export interface Command {
  event_id: string;
  sequence_number: number;
  timestamp_ms: number;
  inter_command_delay_ms: number | null;
  raw_input_b64: string;
  parsed_command: string;
  parsed_args: string[];
  working_directory: string;
  response: string | null;
  exit_code: number | null;
  response_source: ResponseSource;
  deception_action: string | null;
}

export type BaitType = "credential" | "private_key" | "config" | "env_file" | "shadow";

export type AccessType = "read" | "copy" | "exfil_attempt";

export interface BaitEvent {
  event_id: string;
  timestamp_ms: number;
  bait_id: string;
  bait_type: BaitType;
  access_type: AccessType;
  triggered_by_command_event_id: string;
}

export type AttackerClass = "automated_scanner" | "script_kiddie" | "manual_recon" | "apt";

export type Severity = "low" | "medium" | "high" | "critical";

export interface Intelligence {
  attacker_class: string | null;
  classifier_confidence: number | null;
  cluster_id: string | null;
  mitre_techniques: string[] | null;
  session_summary: string | null;
  stix_bundle: unknown | null;
  severity: string | null;
  recommended_actions: string[] | null;
}

export interface SessionDetail {
  session_id: string;
  schema_version: string;
  node_id: string;
  protocol: string;
  client_ip: string;
  client_port: number;
  server_port: number;
  ssh_client_banner: string;
  start_ms: number;
  end_ms: number | null;
  duration_ms: number | null;
  outcome: string;
  command_count: number;
  bait_hit_count: number;
  auth_attempts: AuthAttempt[];
  commands: Command[];
  bait_events: BaitEvent[];
  intelligence: Intelligence;
}

export interface DailyRatePoint {
  date: string;
  n: number;
  rate: number;
  flagged: boolean;
  mean?: number;
  stddev?: number;
}

export interface FieldCardinalityEntry {
  table: string;
  column: string;
  distinct_count: number;
  modal_value: string;
  modal_share: number;
  baseline_modal_share: number;
  collapsed: boolean;
}

export interface CampaignMemberEntry {
  ip: string;
  tier: number;
  session_count: number;
}

export interface AggregateStatsEntry {
  total_sessions: number;
  zero_command_sessions: number;
  zero_command_pct: number;
}

export interface CampaignSection {
  members: CampaignMemberEntry[];
  excluded_candidates: string[];
  total_campaign_sessions: number;
  aggregate_all: AggregateStatsEntry;
  aggregate_excluding_campaign: AggregateStatsEntry;
}

export interface HeartbeatGapEntry {
  start: string;
  end: string;
  duration_seconds: number;
}

export interface HeartbeatSection {
  gaps: HeartbeatGapEntry[];
  last_heartbeat: string | null;
}

export interface ValiditySummary {
  sensor: string;
  computed_at: string;
  accept_rate: DailyRatePoint[];
  accept_rate_flagged_days: number;
  field_cardinality: FieldCardinalityEntry[];
  campaign: CampaignSection;
  heartbeat: HeartbeatSection;
}

export interface SensorList {
  sensors: string[];
  default: string;
}

export interface LLMProvider {
  name: string;
  kind: "anthropic" | "openai_compatible" | string;
  calls_24h?: number;
  model?: string;
}

export interface LLMProviderListing {
  configured: boolean;
  reachable: boolean;
  active: string | null;
  providers: LLMProvider[];
}

export interface ExportSession {
  session_id: string;
  node_id: string;
  client_ip: string;
  ssh_client_banner: string;
  start_ms: number;
  end_ms: number | null;
  duration_ms: number | null;
  outcome: string;
  command_count: number;
  bait_hit_count: number;
  attacker_class: string | null;
  classifier_confidence: number | null;
  cluster_id: string | null;
  mitre_techniques: string[] | null;
  auth_attempt_count: number;
  unique_usernames_tried: number;
  top_username: string | null;
}

export interface ExportResponse {
  generated_at: string;
  session_count: number;
  sessions: ExportSession[];
}

export interface ExportCommand {
  event_id: string;
  session_id: string;
  sequence_number: number;
  timestamp_ms: number;
  inter_command_delay_ms: number | null;
  raw_command: string;
  parsed_command: string;
  parsed_args: string[];
  working_directory: string;
  response: string | null;
  exit_code: number | null;
  response_source: string;
  deception_action: string | null;
  bait_hit: boolean;
  bait_type: string | null;
  client_ip: string;
  ssh_client_banner: string;
  attacker_class: string | null;
  mitre_techniques: string[] | null;
}

export interface ExportCommandsResponse {
  generated_at: string;
  command_count: number;
  next_cursor: string | null;
  commands: ExportCommand[];
}

export interface SessionRow {
  session_id: string;
  client_ip: string;
  ssh_banner: string;
  outcome: string;
  start_ms: number;
  duration_ms: number | null;
  command_count: number;
  bait_hit_count: number;
  attacker_class: string | null;
  classifier_confidence: number | null;
  cluster_id: string | null;
  mitre_techniques: string[];
  severity: Severity;
  auth_attempt_count: number;
  top_username: string | null;
  country: string | null;
  asn: number | null;
  asn_name: string | null;
}

export type SessionSort = "recent" | "duration" | "commands" | "bait" | "severity";

export interface SessionQuery {
  search?: string;
  classes?: string[];
  outcomes?: string[];
  severities?: string[];
  technique?: string;
  cluster?: string;
  bait?: boolean;
  shell?: boolean;
  since_ms?: number;
  until_ms?: number;
  sort?: SessionSort;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  withGeo?: boolean;
}

export interface SessionsPage {
  total: number;
  corpus_total: number;
  limit: number;
  offset: number;
  rows: SessionRow[];
}

export interface Facet {
  name: string;
  count: number;
}

export interface Facets {
  classes: Facet[];
  outcomes: Facet[];
  severities: Facet[];
  techniques: Facet[];
}

export interface ClusterSummary {
  cluster_id: string;
  sessions: number;
  unique_ips: number;
  dominant_class: string | null;
  dominant_banner: string | null;
  top_username: string | null;
  commands: number;
  bait_hits: number;
  first_seen_ms: number;
  last_seen_ms: number;
  prefixes: string[];
}

export interface GeoCountry {
  code: string;
  name: string;
  sessions: number;
  ips: number;
}

export interface GeoASN {
  asn: number;
  name: string | null;
  sessions: number;
  ips: number;
}

export interface GeoSummary {
  available: boolean;
  resolved: number;
  unresolved: number;
  countries: GeoCountry[];
  asns: GeoASN[];
}

export interface Behaviour {
  command_count: number;
  distinct_commands: number;
  repeat_commands: number;
  span_ms: number;
  median_delay_ms: number | null;
  mean_delay_ms: number | null;
  delay_cv: number | null;
  frac_superhuman: number;
  cadence: "human" | "automated" | "superhuman" | "mixed" | "unknown";
  tool_signature: string;
  bait_escalation: number;
  auth_attempts: number;
  unique_usernames: number;
  delays: number[];
}

// Mirrors internal/api/report.go. GET /api/sessions/{id}/report is the only
// endpoint that returns a non-nullable severity: mirage-core prefers the ML
// pipeline's own value and falls back to a class-only derivation when a
// session predates the enrichment (internal/store/read.go:474-487). The
// export dump carries no severity at all, which is why the sessions table
// has to derive its own -- see corpus.ts severityOf and docs/API-GAPS.md.
export interface SessionReport {
  session_id: string;
  generated_at: string;
  profile: {
    class: string | null;
    confidence: number | null;
    cluster_id: string | null;
    severity: string;
  };
  network: { client_ip: string; ssh_banner: string; outcome: string };
  timeline: {
    start_ms: number;
    duration_ms: number | null;
    auth_attempts: number;
    commands: number;
    bait_hits: number;
  };
  threat_intel: {
    mitre_techniques: string[] | null;
    summary: string | null;
    recommended_actions: string[] | null;
  };
  stix_bundle?: unknown;
}

export interface SessionEnvelope {
  detail: SessionDetail;
  behaviour: Behaviour;
  geo: { country: string | null; asn: number | null; asn_name: string | null };
  // null when the sensor could not produce one; the pane then falls back to
  // detail.intelligence.severity rather than showing the derived value.
  report: SessionReport | null;
}

export interface PolicySummary {
  // The sensor has no policy-summary endpoint, so this is folded out of one
  // page of GET /api/export/commands. sample_commands is how many commands
  // that page actually held -- there is no time window involved, and the UI
  // must not imply one.
  sample_commands: number;
  total_decisions: number;
  actions: { name: string; count: number }[];
  recent: {
    command: string;
    category: string | null;
    action: string;
    step: number;
  }[];
  shadow_mode: boolean;
  latency_p95_ms: number | null;
  timeouts: number | null;
  checkpoint: string | null;
}

// Which switches mirage-api actually persists. Per-field, not a single
// global boolean: mirage-core owns deception_enabled/deception_apply_actions
// via GET/PUT /api/config (see docs/API-GAPS.md §4), but llm_shell_enabled,
// stix_enabled and intel_use_llm are still env-only, owned by other
// containers -- a global "writable" would have had to lie about one half or
// the other.
export type WritableConfigKey = "deception_enabled" | "deception_apply_actions";

export interface RuntimeConfig {
  deception_enabled: boolean;
  deception_apply_actions: boolean;
  llm_shell_enabled: boolean;
  stix_enabled: boolean;
  intel_use_llm: boolean;
  public_view: boolean;
  writable: WritableConfigKey[];
  updated_at: string | null;
  updated_by: string | null;
  limits: {
    completions_per_session: number;
    global_rate_limit: number;
    // MIRAGE_LLM_SHELL_RATE_WINDOW_S -- the window global_rate_limit is
    // counted over. Defaults to 60s in ml/mirage/deception/completion.py,
    // NOT an hour.
    rate_window_s: number;
    policy_timeout_ms: number;
    completion_timeout_ms: number;
    commands_per_session: number;
    auth_delay_ms: [number, number];
  };
}

// config/weak_credentials.txt on the sensor. The file's own header declares it
// public bait data, so reading and displaying it is safe; pairs is null when
// the file is not reachable from wherever this app runs.
export interface WeakCredentials {
  path: string | null;
  pairs: string[] | null;
  total: number;
}
