# Printer Service

A WebSocket-connected ESC/POS receipt printer service. Connects to a WebSocket server and prints incoming messages to a thermal receipt printer.

## Printer Modes

The service supports three printer backends:

- **USB** (default) - Connects to a USB thermal printer directly via vendor/product ID
- **Network** (`--ip <address>`) - Connects to a network printer over TCP (default port 9100)
- **Mock** (`--mock`) - Prints to the console for testing

## Usage

```bash
# USB printer
printer-service --url wss://your-server/ws

# Network printer
printer-service --url wss://your-server/ws --ip 192.168.1.100 --port 9100

# Console mock mode
printer-service --url wss://your-server/ws --mock
```

## Building

### Native (x86_64)

```bash
cargo build --release
```

### Cross-Compiling

Both cross-compilation targets require the appropriate GCC toolchain and Rust target installed.

#### ARM64 (aarch64) - .deb package

Builds a `.deb` package using `cargo-deb`.

**Prerequisites:**
```bash
sudo apt install gcc-aarch64-linux-gnu g++-aarch64-linux-gnu
cargo install cargo-deb
rustup target add aarch64-unknown-linux-gnu
```

**Build:**
```bash
./build_deb_arm64.sh
```

Output: `target/aarch64-unknown-linux-gnu/debian/printer-service_<version>-1_arm64.deb`

Install on the target device with:
```bash
sudo dpkg -i printer-service_*.deb
```

#### RISC-V 64-bit (LicheeRV Nano)

Builds a standalone binary for the LicheeRV Nano.

**Prerequisites:**
```bash
sudo apt install gcc-riscv64-linux-gnu
rustup target add riscv64gc-unknown-linux-gnu
```

**Build:**
```bash
./build_lichee.sh
```

Output: `target/riscv64gc-unknown-linux-gnu/release/printer-service`

Copy the binary to the device manually (e.g. via `scp`).
