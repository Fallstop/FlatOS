#!/bin/bash
set -e

# Build script for LicheeRV Nano (RISC-V 64-bit) running Debian
# Target architecture: riscv64gc-unknown-linux-gnu

echo "Checking for cross-compiler..."
if ! command -v riscv64-linux-gnu-gcc &> /dev/null; then
    echo "Error: riscv64-linux-gnu-gcc not found."
    echo "Please install it: sudo apt install gcc-riscv64-linux-gnu"
    exit 1
fi

echo "Adding rust target..."
rustup target add riscv64gc-unknown-linux-gnu

echo "Building printer-service..."
# We need to link against the correct C library.
# usage of TARGET_CC env var tells cargo which linker/cc to use for the target
export CARGO_TARGET_RISCV64GC_UNKNOWN_LINUX_GNU_LINKER=riscv64-linux-gnu-gcc

cargo build --release --target riscv64gc-unknown-linux-gnu

echo "Build complete!"
echo "Binary location: target/riscv64gc-unknown-linux-gnu/release/printer-service"
