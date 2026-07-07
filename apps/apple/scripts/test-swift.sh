#!/bin/sh
# Run the Swift test suites for the local packages.
#
# Works in two environments:
#  - Full Xcode: plain `swift test`.
#  - Command Line Tools only: XCTest is absent, but Swift Testing ships inside
#    the CLT at a non-default path — point the compiler and linker at it.
set -e
cd "$(dirname "$0")/.."

ARGS=""
if ! /usr/bin/xcrun --find xctest >/dev/null 2>&1; then
  CLT=/Library/Developer/CommandLineTools
  export DEVELOPER_DIR="$CLT"
  FW="$CLT/Library/Developer/Frameworks"
  LIB="$CLT/Library/Developer/usr/lib"
  ARGS="-Xswiftc -F$FW -Xlinker -F$FW -Xlinker -rpath -Xlinker $FW -Xlinker -rpath -Xlinker $LIB"
fi

for pkg in ClarityCore ClarityKit; do
  [ -d "$pkg" ] || continue
  echo "== swift test ($pkg) =="
  swift test --package-path "$pkg" $ARGS
done
