/**
 * Pure Python import module-path extraction from source text.
 *
 * Literal `import` / `from … import` only; dynamic forms are excluded.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import {
  readBalancedParenthesisContent,
  splitLeadingRelativeDots,
  textBeforeAsKeyword,
} from "./safeStringScan.js";

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

const stripPythonCommentsAndStrings = (source: string): string => {
  const withoutTripleQuoted = source.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, " ");
  const withoutSingleQuoted = withoutTripleQuoted.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    " ",
  );
  return withoutSingleQuoted.replace(/#[^\n]*/g, " ");
};

const collapseParenthesizedImportBlocks = (source: string): string => {
  let result = "";
  let scanIndex = 0;
  while (scanIndex < source.length) {
    const openIndex = source.indexOf("(", scanIndex);
    if (openIndex === -1) {
      result += source.slice(scanIndex);
      break;
    }

    result += source.slice(scanIndex, openIndex);
    const balancedSpan = readBalancedParenthesisContent(source, openIndex);
    if (!balancedSpan) {
      result += "(";
      scanIndex = openIndex + 1;
      continue;
    }

    const collapsedInner = balancedSpan.content.replace(/\s+/g, " ");
    result += `(${collapsedInner})`;
    scanIndex = balancedSpan.closeIndex + 1;
  }
  return result;
};

const isDynamicImportLine = (line: string): boolean =>
  /\b__import__\s*\(/.test(line) || /\bimportlib\.import_module\s*\(/.test(line);

const parseRelativeModuleSpecifier = (
  specifier: string,
): { level: number; modulePath: string } | null => {
  const relativePrefix = splitLeadingRelativeDots(specifier);
  if (!relativePrefix) {
    return null;
  }

  const moduleRemainder = relativePrefix.remainder.startsWith(".")
    ? relativePrefix.remainder.slice(1)
    : relativePrefix.remainder;
  return {
    level: relativePrefix.dotCount,
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
  return textBeforeAsKeyword(firstSegment);
};

const parseFromImportParts = (
  statement: string,
): { fromModule: string; importClause: string } | null => {
  if (!statement.startsWith("from ")) {
    return null;
  }

  const importKeywordIndex = statement.indexOf(" import ");
  if (importKeywordIndex === -1) {
    return null;
  }

  const fromModule = statement.slice(5, importKeywordIndex).trim();
  const importClause = statement.slice(importKeywordIndex + 8).trim();
  if (!fromModule || !importClause) {
    return null;
  }

  return { fromModule, importClause };
};

const parseImportClause = (statement: string): string | null => {
  if (!statement.startsWith("import ")) {
    return null;
  }

  const importClause = statement.slice(7).trim();
  return importClause || null;
};

const extractImportStatementSpecifiers = (statement: string): readonly string[] => {
  const normalizedStatement = statement.replace(/\s+/g, " ").trim();
  if (!normalizedStatement || isDynamicImportLine(normalizedStatement)) {
    return [];
  }

  const specifiers: string[] = [];

  const fromImportParts = parseFromImportParts(normalizedStatement);
  if (fromImportParts) {
    const { fromModule, importClause } = fromImportParts;
    if (/^\.+$/.test(fromModule)) {
      const importedSymbol = firstImportedSymbol(importClause);
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

  const importClause = parseImportClause(normalizedStatement);
  if (!importClause) {
    return [];
  }

  for (const importSegment of importClause.split(",")) {
    const moduleName = textBeforeAsKeyword(importSegment);
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
