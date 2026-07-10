#!/usr/bin/env sh
set -eu

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

failures=0

run_redacted_grep() {
  label="$1"
  pattern="$2"
  shift 2

  matches="$(
    git grep --untracked --exclude-standard -nI -E -e "$pattern" "$@" 2>/dev/null |
      sed -E 's/(:[0-9]+:).*/\1[redacted]/' || true
  )"
  if [ -n "$matches" ]; then
    printf '%s\n' "Potential $label:"
    printf '%s\n' "$matches"
    failures=1
  fi
}

if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --source . --no-git --redact --verbose
else
  printf '%s\n' "gitleaks not found; running offline fallback checks."
fi

run_redacted_grep "cloud or API credential" \
  '(AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]+)'

run_redacted_grep "private key material" \
  '(BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE[ ]KEY|PRIVATE[ ]KEY-----)'

run_redacted_grep "absolute local user path" \
  '(/Users/[A-Za-z0-9._-]+|/home/[A-Za-z0-9._-]+|[A-Za-z]:\\Users\\[^\\]+)'

run_redacted_grep "private network address" \
  '(192\.168\.[0-9]{1,3}\.[0-9]{1,3}|10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.[0-9]{1,3}\.[0-9]{1,3})'

run_redacted_grep "internal-only hostname" \
  '(\.interna[l]|\.cor[p]|\.loca[l])([^A-Za-z0-9-]|$)'

unsafe_email_matches="$(
  git grep --untracked --exclude-standard -nI -E -e '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' |
    grep -v '@example\.invalid' |
    sed -E 's/(:[0-9]+:).*/\1[redacted]/' || true
)"
if [ -n "$unsafe_email_matches" ]; then
  printf '%s\n' "Potential non-example email address:"
  printf '%s\n' "$unsafe_email_matches"
  failures=1
fi

sensitive_names="$(
  { git ls-files; git ls-files --others --exclude-standard; } |
    grep -E '(^|/)(\.env($|\.)|.*credentials?.*|.*secrets?.*|id_rsa|id_ed25519|.*\.(pem|key|p12|pfx|db|sqlite|sqlite3|csv|xlsx|xls|zip|tar|tgz|gz)$|cdk\.out|\.aws-sam|terraform\.tfstate|tfstate|node_modules|\.venv|dist|build|coverage|exports|inventory)' |
    grep -v -E '^\.env\.example$' || true
)"
if [ -n "$sensitive_names" ]; then
  printf '%s\n' "Tracked sensitive-looking file names:"
  printf '%s\n' "$sensitive_names"
  failures=1
fi

if [ "$failures" -ne 0 ]; then
  printf '%s\n' "Security check failed."
  exit 1
fi

printf '%s\n' "Security check passed."
