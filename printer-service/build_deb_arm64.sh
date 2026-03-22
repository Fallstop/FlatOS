#!/bin/bash
set -e

# Build script for ARM64 (aarch64) .deb package
# Uses `cross` to compile inside a container with compatible glibc

if ! command -v cross &> /dev/null; then
    echo "Error: cross not found."
    echo "Please install it: cargo install cross"
    exit 1
fi

if ! command -v cargo-deb &> /dev/null; then
    echo "Error: cargo-deb not found."
    echo "Please install it: cargo install cargo-deb"
    exit 1
fi

echo "Building printer-service for aarch64 (via cross)..."
cross build --release --target aarch64-unknown-linux-gnu

echo "Packaging .deb..."
cargo deb --target aarch64-unknown-linux-gnu --no-build

mkdir -p output
cp target/aarch64-unknown-linux-gnu/debian/*.deb output/

echo ""
echo "Build complete!"
echo "Deb package copied to:"
ls -1 output/*.deb
