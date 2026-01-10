use std::time::Duration;

use anyhow::Result;
use clap::Parser;
use env_logger::Env;
use escpos::driver::{ConsoleDriver, NativeUsbDriver, NetworkDriver};
use escpos::printer::Printer;
use escpos::utils::Protocol;
use futures_util::StreamExt;
use log::{error, info};
use nusb::MaybeFuture;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Websocket URL to connect to
    #[arg(short, long)]
    url: String,

    /// Run in mock mode (print to console)
    #[arg(short, long)]
    mock: bool,

    /// Network printer IP address
    #[arg(long)]
    ip: Option<String>,

    /// Network printer port
    #[arg(long, default_value_t = 9100)]
    port: u16,
}

#[tokio::main]
async fn main() -> Result<()> {
    rustls::crypto::aws_lc_rs::default_provider().install_default().unwrap();
    env_logger::Builder::from_env(Env::default().default_filter_or("debug")).init();
    let args = Args::parse();

    info!("Starting printer service for LicheeRV Nano...");

    info!("Target Websocket URL: {}", args.url);

    if args.mock {
        info!("Mode: MOCK (Console)");
        let driver = ConsoleDriver::open(true);
        run_service(driver, &args.url).await?;
    } else if let Some(ip) = args.ip {
        info!("Mode: NETWORK ({}:{})", ip, args.port);
        let driver = NetworkDriver::open(&ip, args.port, Some(Duration::from_secs(1)))?;
        run_service(driver, &args.url).await?;
    } else {
        info!("Mode: USB");
        for device in nusb::list_devices().wait().unwrap() {
            println!(
                "Bus: {:03} address: {:03} VID: {:04x} PID: {:04x} Manufacturer: {} Product: {} S/N: {}",
                device.bus_id(),
                device.device_address(),
                device.vendor_id(),
                device.product_id(),
                device.manufacturer_string().unwrap_or_default(),
                device.product_string().unwrap_or_default(),
                device.serial_number().unwrap_or_default(),
            );
        }
        let driver = NativeUsbDriver::open(0x0456, 0x0808)?;
        run_service(driver, &args.url).await?;
    }

    Ok(())
}

async fn run_service<D>(driver: D, url: &str) -> Result<()>
where
    D: escpos::driver::Driver + Send + 'static,
{
    let mut printer = Printer::new(driver, Protocol::default(), None);

    match printer.init() {
        Ok(_) => info!("Printer initialized."),
        Err(e) => {
            error!("Failed to initialize printer: {}", e);
            return Err(anyhow::anyhow!("Printer init failed"));
        }
    }

    loop {
        info!("Connecting to WebSocket...");
        match connect_async(url.into_client_request()?).await {
            Ok((ws_stream, _)) => {
                info!("Connected!");
                let (_write, mut read) = ws_stream.split();

                while let Some(message) = read.next().await {
                    match message {
                        Ok(msg) => {
                            if let Message::Text(text) = msg {
                                info!("Received: {}", text);
                                match print_ticket(&mut printer, &text) {
                                    Ok(_) => info!("Printed ticket."),
                                    Err(e) => error!("Print failed: {}", e),
                                }
                            }
                        }
                        Err(e) => {
                            error!("Connection error: {}", e);
                            break;
                        }
                    }
                }
                info!("Disconnected. Retrying in 5 seconds...");
            }
            Err(e) => {
                error!("Connect failed: {}. Retrying in 5 seconds...", e);
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
    }
}

fn print_ticket<D>(printer: &mut Printer<D>, text: &str) -> Result<()>
where
    D: escpos::driver::Driver,
{
    printer.init()?;
    printer.smoothing(true)?;
    printer.bold(true)?;
    printer.size(1, 1)?;
    printer.writeln("NEW MESSAGE")?;
    printer.bold(false)?;
    printer.size(1, 1)?;
    printer.feed()?;
    printer.writeln(text)?;
    printer.feed()?;
    printer.feed()?;
    printer.print_cut()?;

    Ok(())
}
