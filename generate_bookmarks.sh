#!/bin/sh
set -eu

infile=${1:-urls.txt}
outfile=${2:-bookmarks.html}

{
  printf '%s\n' '<!DOCTYPE NETSCAPE-Bookmark-file-1>'
  printf '%s\n' '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">'
  printf '%s\n' '<TITLE>Bookmarks</TITLE>'
  printf '%s\n' '<H1>Bookmarks</H1>'
  printf '%s\n' '<DL><p>'

  while IFS= read -r url || [ -n "$url" ]; do
    case $url in
      ''|'#'*) continue ;;
    esac

    # Strip leading/trailing quotes (common in url lists)
    url="${url%\"}"
    url="${url#\"}"

    escaped=$(printf '%s' "$url" | sed \
      -e 's/&/\&amp;/g' \
      -e 's/"/\&quot;/g' \
      -e "s/'/\&#39;/g" \
      -e 's/</\&lt;/g' \
      -e 's/>/\&gt;/g')

    printf '  <DT><A HREF="%s">%s</A>\n' "$escaped" "$escaped"
  done < "$infile"

  printf '%s\n' '</DL><p>'
} > "$outfile"
