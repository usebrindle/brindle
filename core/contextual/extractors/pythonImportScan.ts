/**
 * Pure Python import module-path extraction from source text.
 *
 * Literal `import` / `from … import` only; dynamic forms are excluded.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */

const PYTHON_STDLIB_TOP_LEVEL_MODULES = new Set([
  "__future__",
  "_thread",
  "abc",
  "aifc",
  "argparse",
  "array",
  "ast",
  "asyncio",
  "atexit",
  "base64",
  "bdb",
  "binascii",
  "bisect",
  "builtins",
  "bz2",
  "calendar",
  "cgi",
  "cgitb",
  "chunk",
  "cmath",
  "cmd",
  "code",
  "codecs",
  "codeop",
  "collections",
  "colorsys",
  "compileall",
  "concurrent",
  "configparser",
  "contextlib",
  "contextvars",
  "copy",
  "copyreg",
  "cProfile",
  "crypt",
  "csv",
  "ctypes",
  "curses",
  "dataclasses",
  "datetime",
  "dbm",
  "decimal",
  "difflib",
  "dis",
  "distutils",
  "doctest",
  "email",
  "encodings",
  "enum",
  "errno",
  "faulthandler",
  "fcntl",
  "filecmp",
  "fileinput",
  "fnmatch",
  "fractions",
  "ftplib",
  "functools",
  "gc",
  "getopt",
  "getpass",
  "gettext",
  "glob",
  "graphlib",
  "grp",
  "gzip",
  "hashlib",
  "heapq",
  "hmac",
  "html",
  "http",
  "idlelib",
  "imaplib",
  "imghdr",
  "imp",
  "importlib",
  "inspect",
  "io",
  "ipaddress",
  "itertools",
  "json",
  "keyword",
  "lib2to3",
  "linecache",
  "locale",
  "logging",
  "lzma",
  "mailbox",
  "mailcap",
  "marshal",
  "math",
  "mimetypes",
  "mmap",
  "modulefinder",
  "multiprocessing",
  "netrc",
  "nis",
  "nntplib",
  "numbers",
  "operator",
  "optparse",
  "os",
  "ossaudiodev",
  "pathlib",
  "pdb",
  "pickle",
  "pickletools",
  "pipes",
  "pkgutil",
  "platform",
  "plistlib",
  "poplib",
  "posix",
  "posixpath",
  "pprint",
  "profile",
  "pstats",
  "pty",
  "pwd",
  "py_compile",
  "pyclbr",
  "pydoc",
  "queue",
  "quopri",
  "random",
  "re",
  "readline",
  "reprlib",
  "resource",
  "rlcompleter",
  "runpy",
  "sched",
  "secrets",
  "select",
  "selectors",
  "shelve",
  "shlex",
  "shutil",
  "signal",
  "site",
  "smtplib",
  "sndhdr",
  "socket",
  "socketserver",
  "spwd",
  "sqlite3",
  "ssl",
  "stat",
  "statistics",
  "string",
  "stringprep",
  "struct",
  "subprocess",
  "sunau",
  "symtable",
  "sys",
  "sysconfig",
  "tabnanny",
  "tarfile",
  "telnetlib",
  "tempfile",
  "termios",
  "test",
  "textwrap",
  "threading",
  "time",
  "timeit",
  "tkinter",
  "token",
  "tokenize",
  "trace",
  "traceback",
  "tracemalloc",
  "tty",
  "turtle",
  "turtledemo",
  "types",
  "typing",
  "unicodedata",
  "unittest",
  "urllib",
  "uu",
  "uuid",
  "venv",
  "warnings",
  "wave",
  "weakref",
  "webbrowser",
  "winreg",
  "winsound",
  "wsgiref",
  "xdrlib",
  "xml",
  "xmlrpc",
  "zipapp",
  "zipfile",
  "zipimport",
  "zlib",
  "zoneinfo",
]);

const RELATIVE_MODULE_PATTERN = /^(\.+)(.*)$/;
const FROM_IMPORT_PATTERN = /^from\s+(\.+[\w.]*|[\w.]+)\s+import\s+(.+)$/;
const IMPORT_STATEMENT_PATTERN = /^import\s+(.+)$/;

const stripPythonCommentsAndStrings = (source: string): string => {
  const withoutTripleQuoted = source.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, " ");
  const withoutSingleQuoted = withoutTripleQuoted.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    " ",
  );
  return withoutSingleQuoted.replace(/#[^\n]*/g, " ");
};

const collapseParenthesizedImportBlocks = (source: string): string =>
  source.replace(/\(([\s\S]*?)\)/g, (_match, innerBlock: string) =>
    innerBlock.replace(/\s+/g, " "),
  );

const isDynamicImportLine = (line: string): boolean =>
  /\b__import__\s*\(/.test(line) || /\bimportlib\.import_module\s*\(/.test(line);

const parseRelativeModuleSpecifier = (
  specifier: string,
): { level: number; modulePath: string } | null => {
  const relativeMatch = RELATIVE_MODULE_PATTERN.exec(specifier);
  if (!relativeMatch) {
    return null;
  }

  const dotPrefix = relativeMatch[1];
  const moduleRemainder = relativeMatch[2].replace(/^\./, "");
  return {
    level: dotPrefix.length,
    modulePath: moduleRemainder,
  };
};

const isStdlibTopLevelModule = (moduleSpecifier: string): boolean => {
  const topLevelSegment = moduleSpecifier.split(".")[0];
  return PYTHON_STDLIB_TOP_LEVEL_MODULES.has(topLevelSegment);
};

const addModuleSpecifier = (specifiers: Set<string>, moduleSpecifier: string): void => {
  const trimmedSpecifier = moduleSpecifier.trim();
  if (!trimmedSpecifier || isDynamicImportLine(trimmedSpecifier)) {
    return;
  }

  if (trimmedSpecifier.startsWith(".")) {
    specifiers.add(trimmedSpecifier);
    return;
  }

  if (isStdlibTopLevelModule(trimmedSpecifier)) {
    return;
  }

  specifiers.add(trimmedSpecifier);
};

const firstImportedSymbol = (importClause: string): string | undefined => {
  const firstSegment = importClause.split(",")[0]?.trim();
  if (!firstSegment) {
    return undefined;
  }
  return firstSegment.split(/\s+as\s+/)[0]?.trim();
};

const extractImportStatementSpecifiers = (statement: string): readonly string[] => {
  const normalizedStatement = statement.replace(/\s+/g, " ").trim();
  if (!normalizedStatement || isDynamicImportLine(normalizedStatement)) {
    return [];
  }

  const specifiers: string[] = [];

  const fromImportMatch = FROM_IMPORT_PATTERN.exec(normalizedStatement);
  if (fromImportMatch?.[1]) {
    const fromModule = fromImportMatch[1];
    if (/^\.+$/.test(fromModule)) {
      const importedSymbol = firstImportedSymbol(fromImportMatch[2]);
      if (importedSymbol && importedSymbol !== "*") {
        specifiers.push(`${fromModule}${importedSymbol}`);
      } else {
        specifiers.push(fromModule);
      }
    } else {
      specifiers.push(fromModule);
    }
    return specifiers;
  }

  const importMatch = IMPORT_STATEMENT_PATTERN.exec(normalizedStatement);
  if (!importMatch?.[1]) {
    return [];
  }

  const importClause = importMatch[1];
  for (const importSegment of importClause.split(",")) {
    const moduleName = importSegment.trim().split(/\s+as\s+/)[0]?.trim();
    if (moduleName) {
      specifiers.push(moduleName);
    }
  }

  return specifiers;
};

/**
 * Extract module path specifiers from Python source.
 *
 * Handles `import`, `from … import`, relative imports, and parenthesized import lists.
 * Dynamic `__import__` and `importlib.import_module` calls are excluded.
 *
 * @param source - Python source file text.
 * @returns Unresolved module specifiers (absolute or relative).
 */
export const extractPythonImportSpecifiers = (source: string): readonly string[] => {
  const sanitizedSource = collapseParenthesizedImportBlocks(
    stripPythonCommentsAndStrings(source),
  );
  const specifiers = new Set<string>();

  for (const sourceLine of sanitizedSource.split("\n")) {
    const trimmedLine = sourceLine.trim();
    if (!trimmedLine.startsWith("import ") && !trimmedLine.startsWith("from ")) {
      continue;
    }

    for (const moduleSpecifier of extractImportStatementSpecifiers(trimmedLine)) {
      addModuleSpecifier(specifiers, moduleSpecifier);
    }
  }

  return [...specifiers];
};

export { parseRelativeModuleSpecifier, isStdlibTopLevelModule };
