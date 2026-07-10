#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <image-reference> <output-file>" >&2
  exit 2
fi

image_reference=$1
output_file=$2
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(dirname -- "$script_dir")
template="$project_root/.github/release/compose.template.yaml"

case "$image_reference" in
  *[!a-zA-Z0-9._/@:+-]*)
    echo "image reference contains unsupported characters" >&2
    exit 2
    ;;
esac

if [ ! -f "$template" ]; then
  echo "release Compose template not found: $template" >&2
  exit 1
fi

sed "s|__SPAGHETTI_DESK_IMAGE__|$image_reference|g" "$template" > "$output_file"

if grep -q "__SPAGHETTI_DESK_IMAGE__" "$output_file"; then
  echo "release Compose image placeholder was not fully replaced" >&2
  exit 1
fi
