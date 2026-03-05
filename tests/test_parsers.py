from libs.tools.parsers.ffuf_parser import parse_ffuf_hits
from libs.tools.parsers.nmap_parser import parse_open_ports
from libs.tools.parsers.web_fingerprint_parser import parse_whatweb_output


def test_parse_nmap_open_ports():
    sample = """
22/tcp open  ssh     OpenSSH 8.2p1
80/tcp open  http    Apache httpd 2.4.41
"""
    ports = parse_open_ports(sample)
    assert len(ports) == 2
    assert ports[0]["port"] == 22
    assert ports[1]["service"] == "http"


def test_parse_ffuf_hits():
    sample = """
admin [Status: 301, Size: 178, Words: 7, Lines: 8, Duration: 35ms]
api [Status: 200, Size: 521, Words: 65, Lines: 23, Duration: 20ms]
"""
    hits = parse_ffuf_hits(sample)
    assert len(hits) == 2
    assert hits[0]["path"] == "admin"
    assert hits[1]["status"] == 200


def test_parse_whatweb_output():
    sample = "http://10.10.10.10 [200 OK] Apache[2.4.41], PHP[7.4.3], Country[RESERVED][ZZ]"
    rows = parse_whatweb_output(sample)
    assert len(rows) == 1
    assert rows[0]["url"] == "http://10.10.10.10"
    assert any("Apache" in tag for tag in rows[0]["tags"])


def test_parsers_ignore_malformed_lines():
    assert parse_open_ports("not-a-port-line") == []
    assert parse_ffuf_hits("bad ffuf line") == []
    rows = parse_whatweb_output("ERROR timeout")
    assert rows == []
