#!/usr/bin/env python
import re

__doc__ = """
Extracts and strips text within /** .. */ comment delimiters
and outputs it on stdout.
"""

RE_C_START = re.compile("/\*\*")
RE_C_STRIP = re.compile("[ \t]*\*[ \t]?")
RE_C_END   = re.compile("\*/")

def extract( text, start, end, strip ):
	for s in start.finditer(text):
		e = end.search(text, s.end())
		if not e: continue
		t = text[s.end():e.start()]
		yield "".join(strip.split(t))

if __name__ == "__main__":
	import sys
	args = sys.argv[1:]
	out  = sys.stdout
	start, end, strip = RE_C_START, RE_C_END, RE_C_STRIP
	if not args or args == ["-"]:
		out.write(extract(sys.stdin.read(), start, end, strip))
	else:
		for p in args:
			with file(p) as f:
				for line in extract(f.read(), start, end, strip):
					out.write(line)

# EOF
