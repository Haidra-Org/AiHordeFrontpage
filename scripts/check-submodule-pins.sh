#!/bin/sh
# Refuses a push when a pushed commit pins a submodule commit that cannot be fetched from the submodule's
# .gitmodules URL. CI checks out submodules from those URLs, so an unpushed pin fails every job at checkout.
#
# The local submodule remote is not a reliable signal: a submodule's origin can be another local clone.
# Each pin is fetched by SHA from the .gitmodules URL into a scratch repository. The tree:0 filter limits
# the download to the commit object.
#
# Reads git's pre-push lines ("<local ref> <local sha> <remote ref> <remote sha>") on stdin.

zero=0000000000000000000000000000000000000000
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
git init --quiet --bare "$scratch"

failed=0

while read -r local_ref local_sha remote_ref remote_sha; do
  [ "$local_sha" = "$zero" ] && continue

  git config -f .gitmodules --get-regexp '^submodule\..*\.path$' | while read -r key path; do
    name=${key#submodule.}
    name=${name%.path}
    url=$(git config -f .gitmodules --get "submodule.$name.url")
    pin=$(git ls-tree "$local_sha" -- "$path" | awk '$2 == "commit" { print $3 }')
    [ -z "$pin" ] && continue

    if ! git -C "$scratch" fetch --quiet --no-tags --filter=tree:0 "$url" "$pin" 2>/dev/null; then
      echo "pre-push: $path is pinned at $pin, which is not fetchable from $url." >&2
      echo "pre-push: push that commit to $url first." >&2
      exit 1
    fi
  done || failed=1
done

exit $failed
