export interface HeuristicHit {
  family: string;
  severity: "critical" | "high" | "medium";
  title: string;
  message: string;
}

const TITLE = "Suspicious AI skill";

const URL_RE = /https?:\/\/[^\s)'"`<>]+/gi;
const EXFIL_RE =
  /\b(curl|wget|invoke-webrequest|irm\s|iwr\s|fetch\s*\(|axios\.post|process\.env|os\.environ|exfiltrat|webhook\.site|ngrok\.io|discord\.com\/api\/webhooks|api\.telegram\.org\/bot)\b/i;
const PIPE_SHELL_RE = /\b(curl|wget|iwr|irm)\b[\s\S]{0,180}\|\s*(ba)?sh\b/i;
const PASTE_PIPE_SHELL_RE =
  /\b(curl|wget)\b[\s\S]{0,120}(glot\.io|rentry\.co|pastebin\.com|hastebin\.com|paste\.c-net)[\s\S]{0,80}\|\s*(ba)?sh\b/i;
const OBFUSCATED_RE = /\b(eval\s*\(|new Function\s*\(|atob\s*\(|Buffer\.from\s*\([^)]*base64|fromCharCode)\b/i;
const BASE64_BLOB_RE = /(?:[A-Za-z0-9+/]{80,}={0,2})/;
const B64_PIPE_SHELL_RE = /base64\s+(-d|--decode|-D)\b[\s\S]{0,60}\|\s*(ba)?sh\b|\|\s*base64\s+(-d|--decode|-D)\b[\s\S]{0,40}\|\s*(ba)?sh\b/i;
const DATA_URI_EXEC_RE = /data:(?:text\/html|application\/javascript|text\/javascript);base64,[A-Za-z0-9+/=]{40,}/i;
const HEX_BLOB_RE = /(?:\\x[0-9a-fA-F]{2}){20,}/;
const PS_ENCODED_RE = /\bpowershell(\.exe)?\s+-(enc|encodedcommand|e)\b/i;
const CREDS_RE = /\b(api[_-]?key|secret[_-]?key|authorization:\s*bearer|password\s*=)\b/i;
const PROMPT_INJECTION_RE =
  /\b(ignore (all )?(previous|prior|above) (instructions|prompts|rules|guidelines)|disregard (all )?(previous|prior) (instructions|rules)|forget (all )?(previous|prior) (instructions|context)|you are now|system prompt|do not (tell|mention|inform) (the )?user|hidden instruction|\[SYSTEM\]|jailbreak)\b/i;
const PROMPT_MODE_RE =
  /\b(you are now in\s+(unrestricted|debug|developer|admin|god|jailbreak)\s+mode|enter\s+(unrestricted|debug|developer)\s+mode|disable\s+(all\s+)?(safety|security|content|ethical)\s+(filters|checks|guidelines)|bypass\s+(content|usage|safety)\s+policy)\b/i;
const SYSTEM_TOKEN_RE = /<\|system\|>|<\|im_start\|>\s*system|<<SYS>>|\[INST\]\s*:/i;
const HIDDEN_UNICODE_RE = /[\u200B\u200C\u200D\u202E\u2060\u2066\u2067\u2068\u2069]/;
const ENCODED_TAG_RE = /\\u\{?[Ee]00[0-7][0-9A-Fa-f]\}?|\\U000[Ee]00[0-7][0-9A-Fa-f]/;
const BASE_URL_HIJACK_RE = /\b(ANTHROPIC_BASE_URL|OPENAI_API_BASE|OPENAI_BASE_URL)\s*=/i;
const SENSITIVE_PATH_RE = /~\/\.(ssh|aws|npmrc|netrc)|id_rsa|id_ed25519|\.git-credentials|\.env\b/i;
const PASSWORD_ZIP_RE = /\bunzip\s+-P\b/i;
const RAW_IP_URL_RE = /https?:\/\/(?:\d{1,3}\.){3}\d{1,3}\b/i;
const IMDS_RE = /\b(169\.254\.169\.254|metadata\.google\.internal|metadata\.azure\.com)\b/i;
const MD_IMAGE_EXFIL_RE =
  /!\[[^\]]*\]\(https?:\/\/[^)]{0,200}(\{\{?[^}]+\}?\}|\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*)[^)]*\)/;
const MD_IMAGE_INSTRUCT_RE =
  /\b(render|display|show|output|create|generate|insert|embed)\s+(a\s+)?(markdown\s+)?(image|img|picture)\s+.{0,80}\b(data|secret|key|token|password|env|variable|context|conversation)\b/i;
const CRED_EXFIL_INSTRUCT_RE =
  /\b(send|post|upload|submit|forward|transmit)\s+(the\s+|all\s+|your\s+|any\s+)?(reports?|data|keys?|credentials?|tokens?|secrets?|passwords?|results?|information|config|env|variables?|output)\s+(to|at|via)\s+https?:\/\//i;
const CRED_VERIFY_URL_RE =
  /\b(verif|validat|rotat|audit|check|test)\w*\s+(your\s+|the\s+|all\s+)?(credential|key|token|api|secret|password)\w*\s+.{0,40}https?:\/\/(?!github\.com|docs\.|localhost|127\.0\.0\.1)/i;
const URL_ENCODE_SECRET_RE =
  /\b(append|add|include|embed|encode|put|insert)\s+.{0,60}\b(secret|password|token|api[_-]?key|credential|env|context|conversation)\b.{0,40}\b(to|in|into|as|within)\b.{0,30}\b(url|URI|link|query|parameter|endpoint|request)\b/i;
const REMOTE_SKILL_LOAD_RE =
  /\b(fetch|load|download|pull|sync|update)\s+(the\s+)?(config|configuration|settings|rules|behavior|instructions?|commands|skill|SKILL\.md)\s+(from|via|using|at)\s+https?:\/\/(?!github\.com|docs\.|localhost|127\.0\.0\.1)/i;
const EVAL_FETCH_RE = /\b(eval|Function)\s*\(\s*(await\s+)?fetch\s*\(/i;
const EVAL_ATOB_RE = /\b(eval|Function)\s*\(\s*(atob|Buffer\.from)\s*\(/i;
const ALLOWED_TOOLS_STAR_RE = /allowed[-_]?tools\s*[:=].{0,80}Bash\s*\(\s*\*\s*\)/i;
const AUTO_APPROVE_RE =
  /\b(autoApprove|auto[-_]?approve|dangerouslyDisableSandbox|skip[-_]?permissions)\s*[:=]\s*(true|yes|on|\[)/i;
const DISABLE_SANDBOX_RE =
  /\b(disable|turn off)\s+(the\s+)?(agent|ai|skill|claude|copilot)\s+(sandbox|safety|guardrail|restriction|permission)s?\b/i;
const SUDO_SYSTEM_RE =
  /\b(chmod\s+(777|666|4755|6755|[ug]\+s)|chown\s+root|sudo\s+(systemctl|service|usermod|useradd|visudo|iptables))\b/i;
const MEMORY_TAMPER_RE =
  /\b(write|append|inject|overwrite|modify|edit)\s+.{0,50}\b(MEMORY|SOUL|CLAUDE|AGENTS|SKILL)\.md\b/i;
const COVERT_HOOK_RE =
  /\b(on every|for each|after every|whenever the user|when asked any|every time you)\b[\s\S]{0,200}\b(without telling|do not tell|don't tell|don['’]t tell|silently|covertly)\b/i;
const FAKE_ERROR_RE =
  /\b(pretend|claim|fake|simulate)\s+.{0,80}\b(failed|error|denied|unavailable)\b[\s\S]{0,180}\b(while|but|and)\s+.{0,40}\b(silently|secretly|in the background|still)\b.{0,40}\b(send|transmit|run|execute|fetch)\b/i;
const SESSION_START_HOOK_RE =
  /"SessionStart"\s*:\s*\[[\s\S]{0,800}"command"\s*:\s*"(?:bash|sh|zsh|cmd|powershell|pwsh|curl|wget|python)/i;
const FORK_BOMB_RE = /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/;
const AWS_KEY_RE = /\b(AKIA|ASIA)[A-Z0-9]{16}\b/;
const GITHUB_TOKEN_RE = /\bgh[pousr]_[A-Za-z0-9]{36,}\b/;
const STRIPE_LIVE_RE = /\bsk_live_[A-Za-z0-9]{24,}\b/;
const PRIVATE_KEY_RE =
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----\r?\n(?:[A-Za-z0-9+/=]{20,}\r?\n){2,}-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/;
const HTML_COMMENT_RE = /<!--([\s\S]*?)-->/g;
const HTML_COMMENT_PAYLOAD_RE =
  /\b(ignore|override|bypass|exfiltrat|curl\s|wget\s|eval\s|base64|do not (tell|mention)|api[_-]?key.{0,40}https?:\/\/|send all|agent should)\b/i;
const EXAMPLE_AWS_RE = /EXAMPLE/i;

function hasAsciiSmuggling(content: string): boolean {
  for (const ch of content) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && cp >= 0xe0000 && cp <= 0xe007f) {
      return true;
    }
  }
  return ENCODED_TAG_RE.test(content);
}

function hasMaliciousHtmlComment(content: string): boolean {
  HTML_COMMENT_RE.lastIndex = 0;
  for (const m of content.matchAll(HTML_COMMENT_RE)) {
    if (m[1] && HTML_COMMENT_PAYLOAD_RE.test(m[1])) {
      return true;
    }
  }
  return false;
}

function hasLiveHardcodedSecret(content: string): boolean {
  const aws = content.match(AWS_KEY_RE);
  if (aws && !EXAMPLE_AWS_RE.test(aws[0])) {
    return true;
  }
  return GITHUB_TOKEN_RE.test(content) || STRIPE_LIVE_RE.test(content) || PRIVATE_KEY_RE.test(content);
}

type Detector = {
  family: string;
  severity: HeuristicHit["severity"];
  message: (filename: string) => string;
  test: (content: string) => boolean;
};

const DETECTORS: Detector[] = [
  {
    family: "prompt-injection",
    severity: "critical",
    message: (f) => `${f} contains hidden or override instructions typical of prompt injection.`,
    test: (c) => PROMPT_INJECTION_RE.test(c) || PROMPT_MODE_RE.test(c) || SYSTEM_TOKEN_RE.test(c),
  },
  {
    family: "hidden-unicode",
    severity: "critical",
    message: (f) => `${f} contains hidden Unicode or ASCII-smuggling tag characters.`,
    test: (c) => HIDDEN_UNICODE_RE.test(c) || hasAsciiSmuggling(c),
  },
  {
    family: "html-comment",
    severity: "critical",
    message: (f) => `${f} hides override or exfil instructions inside HTML comments.`,
    test: hasMaliciousHtmlComment,
  },
  {
    family: "dropper-shell",
    severity: "critical",
    message: (f) => `${f} instructs a remote download piped to a shell, a raw-IP URL, or a password-protected archive.`,
    test: (c) => PIPE_SHELL_RE.test(c) || PASTE_PIPE_SHELL_RE.test(c) || RAW_IP_URL_RE.test(c) || PASSWORD_ZIP_RE.test(c),
  },
  {
    family: "fork-bomb",
    severity: "critical",
    message: (f) => `${f} contains a fork-bomb pattern that can exhaust process limits.`,
    test: (c) => FORK_BOMB_RE.test(c),
  },
  {
    family: "markdown-exfil",
    severity: "critical",
    message: (f) => `${f} constructs markdown images/URLs that can exfiltrate secrets when rendered.`,
    test: (c) => MD_IMAGE_EXFIL_RE.test(c) || MD_IMAGE_INSTRUCT_RE.test(c),
  },
  {
    family: "credential-exfil",
    severity: "critical",
    message: (f) => `${f} instructs sending credentials or secrets to an external URL.`,
    test: (c) => CRED_EXFIL_INSTRUCT_RE.test(c) || CRED_VERIFY_URL_RE.test(c) || URL_ENCODE_SECRET_RE.test(c),
  },
  {
    family: "imds-exfil",
    severity: "high",
    message: (f) => `${f} references cloud instance-metadata endpoints used to steal IAM credentials.`,
    test: (c) => IMDS_RE.test(c),
  },
  {
    family: "exfil-env",
    severity: "high",
    message: (f) => `${f} mentions download, credential files, or environment access that can exfiltrate secrets.`,
    test: (c) => EXFIL_RE.test(c) || SENSITIVE_PATH_RE.test(c),
  },
  {
    family: "obfuscation",
    severity: "high",
    message: (f) => `${f} contains eval/base64-style obfuscation typical of droppers.`,
    test: (c) =>
      OBFUSCATED_RE.test(c) ||
      BASE64_BLOB_RE.test(c) ||
      B64_PIPE_SHELL_RE.test(c) ||
      DATA_URI_EXEC_RE.test(c) ||
      HEX_BLOB_RE.test(c) ||
      PS_ENCODED_RE.test(c) ||
      EVAL_ATOB_RE.test(c),
  },
  {
    family: "remote-skill-load",
    severity: "high",
    message: (f) => `${f} loads skill/config/instructions from a remote URL (rug-pull / remote update).`,
    test: (c) => REMOTE_SKILL_LOAD_RE.test(c) || EVAL_FETCH_RE.test(c),
  },
  {
    family: "permission-abuse",
    severity: "high",
    message: (f) => `${f} requests unbounded tools, auto-approve, sandbox disablement, or system permission changes.`,
    test: (c) =>
      ALLOWED_TOOLS_STAR_RE.test(c) || AUTO_APPROVE_RE.test(c) || DISABLE_SANDBOX_RE.test(c) || SUDO_SYSTEM_RE.test(c),
  },
  {
    family: "agent-memory-tamper",
    severity: "critical",
    message: (f) => `${f} instructs writing persistent agent memory/config files (CLAUDE.md/MEMORY.md/AGENTS.md).`,
    test: (c) => MEMORY_TAMPER_RE.test(c),
  },
  {
    family: "covert-hook",
    severity: "high",
    message: (f) => `${f} installs a persistent covert hook or fake-error cover for background actions.`,
    test: (c) => COVERT_HOOK_RE.test(c) || FAKE_ERROR_RE.test(c),
  },
  {
    family: "session-start-hook",
    severity: "critical",
    message: (f) => `${f} registers a SessionStart hook that can run commands before the user trusts the repo.`,
    test: (c) => SESSION_START_HOOK_RE.test(c),
  },
  {
    family: "base-url-hijack",
    severity: "high",
    message: (f) => `${f} overrides the model API base URL, which can MITM agent traffic.`,
    test: (c) => BASE_URL_HIJACK_RE.test(c),
  },
  {
    family: "hardcoded-secret",
    severity: "critical",
    message: (f) => `${f} contains a hardcoded cloud/API key or private key block.`,
    test: hasLiveHardcodedSecret,
  },
];

function credsWithUrls(content: string, filename: string): HeuristicHit | undefined {
  const urls = content.match(URL_RE) || [];
  const external = urls.filter((u) => !/osv\.dev|github\.com|chaintrap\.com/i.test(u));
  if (CREDS_RE.test(content) && external.length) {
    return {
      family: "creds-with-urls",
      severity: "medium",
      title: TITLE,
      message: `${filename} mixes credential terms with outbound URLs: ${external.slice(0, 3).join(", ")}`,
    };
  }
  if (external.length >= 3) {
    return {
      family: "many-urls",
      severity: "medium",
      title: TITLE,
      message: `${filename} references ${external.length} external URLs.`,
    };
  }
  return undefined;
}

/** Unmerged detector hits — used by tests. Production findings still merge by title. */
export function collectHeuristicHits(content: string, filename: string): HeuristicHit[] {
  const hits: HeuristicHit[] = [];
  for (const det of DETECTORS) {
    if (det.test(content)) {
      hits.push({
        family: det.family,
        severity: det.severity,
        title: TITLE,
        message: det.message(filename),
      });
    }
  }
  const extra = credsWithUrls(content, filename);
  if (extra) {
    hits.push(extra);
  }
  return hits;
}

export function analyzeSkillOrRule(content: string, filename: string): HeuristicHit[] {
  return dedupeHits(collectHeuristicHits(content, filename));
}

function dedupeHits(hits: HeuristicHit[]): HeuristicHit[] {
  const byTitle = new Map<string, HeuristicHit>();
  for (const hit of hits) {
    const prev = byTitle.get(hit.title);
    if (!prev) {
      byTitle.set(hit.title, { ...hit });
      continue;
    }
    prev.message = `${prev.message} ${hit.message}`;
    if (rank(hit.severity) > rank(prev.severity)) {
      prev.severity = hit.severity;
    }
  }
  return [...byTitle.values()];
}

function rank(s: HeuristicHit["severity"]): number {
  return s === "critical" ? 3 : s === "high" ? 2 : 1;
}
