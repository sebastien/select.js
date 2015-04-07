#!/usr/bin/env python
import re

__doc__ = """
Extracts and strips text within /** .. */ comment delimiters
and outputs it on stdout.
"""

"""{{{
# #  Litterate.py
# ## A multi-language litterate programming tool

```
Version :  ${VERSION}
URL     :  http://github.com/sebastien/litterate.py
```

A tool to help with litterate programming documentation from source files.

}}}"""

# {{{PASTE:COMMAND_LINE}}}
# {{{PASTE:API}}}

# -----------------------------------------------------------------------------
#
# LANGUAGES
#
# -----------------------------------------------------------------------------

# {{{CUT:API}}}
"""{{{
API
---

The language class defines how "litterate" strings are extracted from the
source file.

}}}"""

class Language(object):

	RE_START = None
	RE_END   = None
	RE_STRIP = None

	def extract( self, text, start=None, end=None, strip=None ):
		start = start or self.RE_START
		end   = end   or self.RE_END
		strip = strip or self.RE_STRIP
		for s in start.finditer(text):
			e = end.search(text, s.end())
			if not e: continue
			t = text[s.end():e.start()]
			yield "".join(strip.split(t))

class C(Language):
	RE_START = re.compile("/\*\*")
	RE_END   = re.compile("\*/")
	RE_STRIP = re.compile("[ \t]*\*[ \t]?")

class C(Language):
	pass

class JavaScript(C):
	pass

class Sugar(Language):
	RE_C_START = re.compile("{{{")
	RE_C_STRIP = re.compile("[ \t]\|[ \t]?")
	RE_C_END   = re.compile("}}}")

# -----------------------------------------------------------------------------
#
# FUNCTIONS
#
# -----------------------------------------------------------------------------

LANGUAGES = {
	"c|cpp|h" : C,
	"js"      : JavaScript,
	"sjs|spy" : Sugar
}

"""{{{
litterate.getLanguage(filename:String)::
	Returns the `Language` instance that corresponds to the given extension.
}}}
"""
def getLanguage( filename ):
	ext = filename.rsplit(".", 1)[-1]
	for pattern, parser in LANGUAGES.items():
		if re.match(pattern, ext):
			return parser()
	return None

# -----------------------------------------------------------------------------
#
# MAIN
#
# -----------------------------------------------------------------------------

if __name__ == "__main__":

	# {{{CUT:COMMAND_LINE}}}
	"""{{{
	Command-line tool
	-----------------

	`litterate.py` can be executed as a command-line tool.

	`litterate.py [OPTIONS] FILE...`

	`FILE` is optional (by default, stdin will be used). You can use `--` to
	explicitely read data from stding.

	It takes the following options:

	- `-l=LANG` `--language=LANG`, where `LANG` is any of `c`, `js` or `sugar`.
	  If you don't give a language, it will output the list of supported languages.

	- `-o=PATH` will output the resulting text to the given file. By default,
	  the extracted text is printed on stdout.

	}}}"""
	import sys
	args = sys.argv[1:]
	out  = sys.stdout
	if not args or args == ["-"]:
		out.write(extract(sys.stdin.read(), start, end, strip))
	else:
		for p in args:
			language = getLanguage(p)
			assert language, "No language registered for file: {0}".format(p)
			with file(p) as f:
				for line in language.extract(f.read()):
					out.write(line)
# EOF
