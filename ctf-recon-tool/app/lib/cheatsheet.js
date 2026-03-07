export const CHEATSHEET = [
  {
    tool: 'Nmap',
    categories: [
      {
        name: 'Stealth / Speed',
        flags: [
          { flag: '-T2', desc: 'Slow & Polite (Avoids IDS)' },
          { flag: '-sS', desc: 'TCP SYN Scan (Half-open)' },
          { flag: '-Pn', desc: 'No Ping (Skip host discovery)' }
        ]
      },
      {
        name: 'Standard',
        flags: [
          { flag: '-sV', desc: 'Version Detection' },
          { flag: '-sC', desc: 'Default Scripts' },
          { flag: '-O', desc: 'OS Detection' }
        ]
      },
      {
        name: 'Aggressive',
        flags: [
          { flag: '-A', desc: 'Aggressive (OS, Scripts, Traceroute)' },
          { flag: '-T4', desc: 'Aggressive Timing' },
          { flag: '-p-', desc: 'Scan All 65,535 Ports' }
        ]
      }
    ]
  },
  {
    tool: 'Gobuster / FFUF',
    categories: [
      {
        name: 'Directory Brute',
        flags: [
          { flag: '-x php,txt,html', desc: 'Add extensions (Gobuster)' },
          { flag: '-t 50', desc: 'Increase threads (Faster)' },
          { flag: '-recursion', desc: 'Recursive scanning' }
        ]
      },
      {
        name: 'FFUF Special',
        flags: [
          { flag: '-mc 200,403', desc: 'Filter Match Codes' },
          { flag: '-fc 404', desc: 'Filter Out 404s' },
          { flag: '-H "Header: Value"', desc: 'Add Custom Header' }
        ]
      }
    ]
  },
  {
    tool: 'SMB / AD',
    categories: [
      {
        name: 'SMBClient',
        flags: [
          { flag: '-N', desc: 'No Password (Anonymous)' },
          { flag: '-L', desc: 'List Shares' }
        ]
      },
      {
        name: 'Enum4Linux',
        flags: [
          { flag: '-a', desc: 'Do everything' },
          { flag: '-U', desc: 'Get userlist' }
        ]
      }
    ]
  },
  {
    tool: 'Curl (Data Extraction)',
    categories: [
      {
        name: 'Headers & Cookies',
        flags: [
          { flag: '-I', desc: 'Fetch Headers only' },
          { flag: '-b "c=1"', desc: 'Send Cookie' },
          { flag: '-H "Header: Val"', desc: 'Custom Header' }
        ]
      },
      {
        name: 'Extraction & Burp',
        flags: [
          { flag: '-L', desc: 'Follow Redirects' },
          { flag: '-o out.txt', desc: 'Save Output to file' },
          { flag: '-x http://127.0.0.1:8080', desc: 'Proxy to Burp' }
        ]
      }
    ]
  },
  {
    tool: 'External Advisors',
    categories: [
      {
        name: 'Traffic Analysis',
        flags: [
          { flag: 'Burp Suite', desc: 'Best for intercepting & modifying requests' },
          { flag: 'Postman', desc: 'Great for API testing and automation' }
        ]
      }
    ]
  },
  {
    tool: 'DNS & SSL Recon',
    categories: [
      {
        name: 'DNS Enumeration',
        flags: [
          { flag: 'dnsrecon -d {t} -t std', desc: 'Standard DNS scan' },
          { flag: 'dnsrecon -d {t} -t brt', desc: 'DNS Brute force' },
          { flag: 'dnsrecon -d {t} -a', desc: 'AXFR Zone Transfer' }
        ]
      },
      {
        name: 'SSL/TLS Analysis',
        flags: [
          { flag: 'sslscan {t}', desc: 'Full SSL/TLS scan' },
          { flag: 'sslscan --certinfo {t}', desc: 'Show certificate info' }
        ]
      }
    ]
  },
  {
    tool: 'Advanced Web',
    categories: [
      {
        name: 'SQL Exploration',
        flags: [
          { flag: 'sqlmap -u "url" --batch', desc: 'Automatic SQLi scan' },
          { flag: 'sqlmap -u "url" --dbs', desc: 'List databases' },
          { flag: 'sqlmap -u "url" -D db --tables', desc: 'List tables in DB' },
          { flag: 'sqlmap -u "url" -D db -T tbl --dump', desc: 'Dump table data' },
          { flag: 'sqlmap -u "url" --level=5 --risk=3', desc: 'Aggressive scanning' },
          { flag: 'sqlmap -u "url" --os-shell', desc: 'Attempt OS shell' }
        ]
      }
    ]
  },
  {
    tool: 'Hydra',
    categories: [
      {
        name: 'Brute Force',
        flags: [
          { flag: '-l <user>', desc: 'Single username' },
          { flag: '-L <file>', desc: 'Username list' },
          { flag: '-p <pass>', desc: 'Single password' },
          { flag: '-P <file>', desc: 'Password list' },
          { flag: '-t 4', desc: 'Number of threads (default 16)' },
          { flag: '-s <port>', desc: 'Custom port' },
          { flag: '-V', desc: 'Verbose: show each attempt' }
        ]
      },
      {
        name: 'Protocols',
        flags: [
          { flag: 'hydra -l admin -P rockyou.txt ssh://TARGET', desc: 'SSH brute force' },
          { flag: 'hydra -l admin -P rockyou.txt ftp://TARGET', desc: 'FTP brute force' },
          { flag: 'hydra -l admin -P rockyou.txt TARGET http-post-form "/login:user=^USER^&pass=^PASS^:Invalid"', desc: 'HTTP form brute force' }
        ]
      }
    ]
  },
  {
    tool: 'John the Ripper',
    categories: [
      {
        name: 'Cracking',
        flags: [
          { flag: '--wordlist=<file>', desc: 'Dictionary attack' },
          { flag: '--format=<fmt>', desc: 'Force hash format (md5, sha1, ntlm...)' },
          { flag: '--rules', desc: 'Apply word mangling rules' },
          { flag: '--show', desc: 'Show cracked passwords' },
          { flag: '--incremental', desc: 'Brute force mode' }
        ]
      },
      {
        name: 'Hash Extraction',
        flags: [
          { flag: 'ssh2john id_rsa > hash.txt', desc: 'Extract hash from SSH key' },
          { flag: 'zip2john file.zip > hash.txt', desc: 'Extract hash from ZIP' },
          { flag: 'unshadow /etc/passwd /etc/shadow > combined.txt', desc: 'Combine passwd + shadow' }
        ]
      }
    ]
  },
  {
    tool: 'Hashcat',
    categories: [
      {
        name: 'Attack Modes',
        flags: [
          { flag: '-a 0', desc: 'Dictionary attack' },
          { flag: '-a 3', desc: 'Brute-force / mask attack' },
          { flag: '-a 6', desc: 'Hybrid wordlist + mask' }
        ]
      },
      {
        name: 'Common Hash Types (-m)',
        flags: [
          { flag: '-m 0', desc: 'MD5' },
          { flag: '-m 100', desc: 'SHA1' },
          { flag: '-m 1000', desc: 'NTLM (Windows)' },
          { flag: '-m 1800', desc: 'sha512crypt ($6$) — Linux shadow' },
          { flag: '-m 3200', desc: 'bcrypt ($2*$)' },
          { flag: '-m 13100', desc: 'Kerberos TGS-REP (AS-REP roasting)' }
        ]
      },
      {
        name: 'Usage',
        flags: [
          { flag: '--show', desc: 'Display already-cracked hashes' },
          { flag: '-o out.txt', desc: 'Save cracked passwords to file' },
          { flag: 'hashcat -m 0 hash.txt rockyou.txt', desc: 'MD5 dictionary crack' }
        ]
      }
    ]
  },
  {
    tool: 'Nikto',
    categories: [
      {
        name: 'Scanning',
        flags: [
          { flag: '-h <target>', desc: 'Target host or URL' },
          { flag: '-p <port>', desc: 'Target port (default 80)' },
          { flag: '-ssl', desc: 'Force SSL/HTTPS' },
          { flag: '-o <file>', desc: 'Output file' },
          { flag: '-Format <fmt>', desc: 'Output format: htm, csv, txt, xml' },
          { flag: '-Tuning x', desc: 'Scan tuning: 1=Files, 2=Misc, 4=Inject, 9=SQL...' },
          { flag: '-useragent <ua>', desc: 'Set custom User-Agent' }
        ]
      }
    ]
  },
  {
    tool: 'Feroxbuster',
    categories: [
      {
        name: 'Directory Brute',
        flags: [
          { flag: '-u <url>', desc: 'Target URL' },
          { flag: '-w <wordlist>', desc: 'Wordlist path' },
          { flag: '-x php,html,txt', desc: 'File extensions to fuzz' },
          { flag: '--depth 2', desc: 'Recursion depth (0 = unlimited)' },
          { flag: '--filter-status 404,403', desc: 'Hide responses by status code' },
          { flag: '--no-recursion', desc: 'Disable recursive scanning' },
          { flag: '-t 50', desc: 'Number of threads' },
          { flag: '-o out.txt', desc: 'Save output to file' }
        ]
      }
    ]
  },
  {
    tool: 'GTFOBins / PrivEsc',
    categories: [
      {
        name: 'Sudo Escapes',
        flags: [
          { flag: 'sudo -l', desc: 'List allowed sudo commands for current user' },
          { flag: 'sudo find . -exec /bin/bash \\;', desc: 'Escape via find' },
          { flag: 'sudo vim -c \'!bash\'', desc: 'Escape via vim' },
          { flag: 'sudo python3 -c \'import os; os.system("/bin/bash")\'', desc: 'Escape via python' },
          { flag: 'sudo awk \'BEGIN {system("/bin/bash")}\'', desc: 'Escape via awk' },
          { flag: 'sudo less /etc/passwd  # then: !/bin/bash', desc: 'Escape via less' }
        ]
      },
      {
        name: 'Enumeration',
        flags: [
          { flag: 'find / -perm -4000 2>/dev/null', desc: 'Find SUID binaries' },
          { flag: 'find / -perm -2000 2>/dev/null', desc: 'Find SGID binaries' },
          { flag: 'find / -writable -type f 2>/dev/null', desc: 'Find world-writable files' },
          { flag: 'cat /etc/crontab', desc: 'Check cron jobs' },
          { flag: 'env', desc: 'Dump environment variables' },
          { flag: 'id && whoami', desc: 'Current user and groups' }
        ]
      }
    ]
  }
];
