#!/usr/bin/env bash
set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" ]]; then
  echo "用法: npm run validate:epub -- path/to/book.epub" >&2
  exit 2
fi
if [[ ! -f "$FILE" ]]; then
  echo "找不到文件: $FILE" >&2
  exit 2
fi

JAR="${EPUBCHECK_JAR:-tools/epubcheck-5.4.0/epubcheck.jar}"
if [[ ! -f "$JAR" ]]; then
  echo "找不到 EPUBCheck: $JAR" >&2
  echo "请从 https://github.com/w3c/epubcheck/releases 下载 5.4.0 发行包，" >&2
  echo "解压到 tools/epubcheck-5.4.0/，或设置 EPUBCHECK_JAR 指向 epubcheck.jar。" >&2
  exit 2
fi

exec java -jar "$JAR" "$FILE"
