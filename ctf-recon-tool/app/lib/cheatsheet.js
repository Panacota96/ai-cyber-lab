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
  }
];
