export interface HeuristicHit {
  severity: "high" | "medium";
  title: string;
  message: string;
}

const URL_RE = /https?:\/\/[^\s)'"`<>]+/gi;
const EXFIL_RE =
  /\b(curl|wget|invoke-webrequest|irm\s|iwr\s|fetch\s*\(|axios\.post|process\.env|os\.environ|exfiltrat|webhook\.site|ngrok\.io)\b/i;
const OBFUSCATED_RE = /\b(eval\s*\(|new Function\s*\(|atob\s*\(|Buffer\.from\s*\([^)]*base64|fromCharCode)\b/i;
const BASE64_BLOB_RE = /(?:[A-Za-z0-9+/]{80,}={0,2})/;
const CREDS_RE = /\b(api[_-]?key|secret[_-]?key|authorization:\s*bearer|password\s*=)\b/i;

export function analyzeSkillOrRule(content: string, filename: string): HeuristicHit[] {
  const hits: HeuristicHit[] = [];
  const urls = content.match(URL_RE) || [];
  const external = urls.filter((u) => !/osv\.dev|github\.com|chaintrap\.com/i.test(u));
  if (EXFIL_RE.test(content)) {
    hits.push({
      severity: "high",
      title: "Suspicious network or env access in agent file",
      message: `${filename} mentions download, HTTP post, or environment credential access.`,
    });
  }
  if (OBFUSCATED_RE.test(content) || BASE64_BLOB_RE.test(content)) {
    hits.push({
      severity: "high",
      title: "Obfuscated payload in agent file",
      message: `${filename} contains eval/base64-style obfuscation typical of droppers.`,
    });
  }
  if (CREDS_RE.test(content) && external.length) {
    hits.push({
      severity: "medium",
      title: "Credential language plus external URL",
      message: `${filename} mixes credential terms with outbound URLs: ${external.slice(0, 3).join(", ")}`,
    });
  } else if (external.length >= 3) {
    hits.push({
      severity: "medium",
      title: "Multiple external URLs in agent file",
      message: `${filename} references ${external.length} external URLs.`,
    });
  }
  return hits;
}
