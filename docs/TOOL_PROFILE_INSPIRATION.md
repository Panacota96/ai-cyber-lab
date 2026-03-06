# Tool Profile Inspiration Mapping

This document maps external inspiration sources into concrete local-first implementation decisions.

## Inspiration Sources
- PentAGI: `https://github.com/vxcontrol/pentagi`
- Pentest-Tools collection: `https://github.com/S3cur3Th1sSh1t/Pentest-Tools`

## Implemented in AI Cyber Lab
- Added profile-driven allowlist resolution in [libs/tools/tool_profiles.py](/mnt/c/Users/david/OneDrive%20-%20Pontificia%20Universidad%20Javeriana/Documents/GitHub/ai-cyber-lab/libs/tools/tool_profiles.py).
- Exposed profile metadata via `/capabilities` in [apps/tool_exec/main.py](/mnt/c/Users/david/OneDrive%20-%20Pontificia%20Universidad%20Javeriana/Documents/GitHub/ai-cyber-lab/apps/tool_exec/main.py).
- Reused the same allowlist resolution for host/service execution in [libs/tools/cli_exec.py](/mnt/c/Users/david/OneDrive%20-%20Pontificia%20Universidad%20Javeriana/Documents/GitHub/ai-cyber-lab/libs/tools/cli_exec.py).

## Profiles
- `baseline`: stable core recon + cracking essentials.
- `web`: web-assessment-heavy stack.
- `ad`: AD/internal-assessment-heavy stack.
- `expanded`: broader catalog for advanced labs.

## How To Use
```bash
export AICL_TOOL_PROFILE=web
export AICL_ALLOWED_TOOLS_EXTRA=amass,subfinder
curl -sS http://127.0.0.1:8082/capabilities
```

## Notes
- Keep `AICL_ALLOWED_TOOLS` as the hard policy source of truth.
- Use profiles to scale safely by engagement type, not to remove authorization controls.
