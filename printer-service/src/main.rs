use std::time::Duration;

use anyhow::Result;
use chrono::Local;
use clap::Parser;
use env_logger::Env;
use escpos::driver::{ConsoleDriver, NativeUsbDriver, NetworkDriver};
use escpos::printer::Printer;
use escpos::utils::Protocol;
use futures_util::StreamExt;
use log::{error, info, warn};
use nusb::MaybeFuture;
use rand::Rng;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};

const MAX_CONSECUTIVE_PRINT_FAILURES: u32 = 5;
const WS_BACKOFF_INITIAL: Duration = Duration::from_secs(1);
const WS_BACKOFF_MAX: Duration = Duration::from_secs(30);
const WS_READ_TIMEOUT: Duration = Duration::from_secs(90);

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
        run_service(driver, &args.url, None::<fn() -> Result<ConsoleDriver>>).await?;
    } else if let Some(ip) = args.ip {
        info!("Mode: NETWORK ({}:{})", ip, args.port);
        spawn_daily_reset(&ip);
        let driver = NetworkDriver::open(&ip, args.port, Some(Duration::from_secs(1)))?;
        let reconnect_ip = ip.clone();
        let reconnect_port = args.port;
        run_service(driver, &args.url, Some(move || {
            info!("Reconnecting to printer at {}:{}...", reconnect_ip, reconnect_port);
            NetworkDriver::open(&reconnect_ip, reconnect_port, Some(Duration::from_secs(1)))
                .map_err(|e| anyhow::anyhow!(e))
        })).await?;
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
        run_service(driver, &args.url, None::<fn() -> Result<NativeUsbDriver>>).await?;
    }

    Ok(())
}

async fn run_service<D, F>(driver: D, url: &str, reconnect: Option<F>) -> Result<()>
where
    D: escpos::driver::Driver + Send + 'static,
    F: Fn() -> Result<D>,
{
    let mut printer = Printer::new(driver, Protocol::default(), None);

    match printer.init() {
        Ok(_) => info!("Printer initialized."),
        Err(e) => {
            error!("Failed to initialize printer: {}", e);
            return Err(anyhow::anyhow!("Printer init failed"));
        }
    }

    let mut consecutive_print_failures: u32 = 0;
    let mut ws_backoff = WS_BACKOFF_INITIAL;

    loop {
        info!("Connecting to WebSocket...");
        match connect_async(url.into_client_request()?).await {
            Ok((ws_stream, _)) => {
                info!("Connected!");
                ws_backoff = WS_BACKOFF_INITIAL;

                let (_write, mut read) = ws_stream.split();

                loop {
                    match tokio::time::timeout(WS_READ_TIMEOUT, read.next()).await {
                        Ok(Some(message)) => match message {
                            Ok(msg) => {
                                if let Message::Text(text) = msg {
                                    info!("Received: {}", text);
                                    match print_ticket(&mut printer, &text) {
                                        Ok(_) => {
                                            info!("Printed ticket.");
                                            consecutive_print_failures = 0;
                                        }
                                        Err(e) => {
                                            consecutive_print_failures += 1;
                                            error!(
                                                "Print failed ({}/{}): {}",
                                                consecutive_print_failures,
                                                MAX_CONSECUTIVE_PRINT_FAILURES,
                                                e
                                            );

                                            // Attempt to reconnect the printer driver
                                            if let Some(ref reconnect_fn) = reconnect {
                                                match reconnect_fn() {
                                                    Ok(new_driver) => {
                                                        printer = Printer::new(new_driver, Protocol::default(), None);
                                                        match printer.init() {
                                                            Ok(_) => {
                                                                info!("Printer reconnected successfully.");
                                                                consecutive_print_failures = 0;
                                                            }
                                                            Err(e) => {
                                                                warn!("Printer reconnected but init failed: {}", e);
                                                            }
                                                        }
                                                    }
                                                    Err(e) => {
                                                        warn!("Printer reconnect failed: {}", e);
                                                    }
                                                }
                                            }

                                            if consecutive_print_failures
                                                >= MAX_CONSECUTIVE_PRINT_FAILURES
                                            {
                                                error!(
                                                    "Printer appears disconnected after {} consecutive failures, exiting for restart",
                                                    consecutive_print_failures
                                                );
                                                return Err(anyhow::anyhow!(
                                                    "Printer disconnected"
                                                ));
                                            }
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                error!("WebSocket error: {}", e);
                                break;
                            }
                        },
                        Ok(None) => {
                            info!("WebSocket stream ended.");
                            break;
                        }
                        Err(_) => {
                            warn!(
                                "No WebSocket message received in {:?}, reconnecting...",
                                WS_READ_TIMEOUT
                            );
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                error!("WebSocket connect failed: {}", e);
            }
        }

        let jitter = rand::rng().random_range(0..=1000);
        let sleep_dur = ws_backoff + Duration::from_millis(jitter);
        info!("Reconnecting in {:?}...", sleep_dur);
        tokio::time::sleep(sleep_dur).await;
        ws_backoff = (ws_backoff * 2).min(WS_BACKOFF_MAX);
    }
}

/// Spawns a background task that calls /reset_srv on the network printer at 12pm daily.
fn spawn_daily_reset(ip: &str) {
    let url = format!("http://{}/reset_srv", ip);
    info!("Scheduling daily printer reset at 12:00 via {}", url);

    tokio::spawn(async move {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("failed to build HTTP client");

        loop {
            let now = Local::now();
            let today_noon = now
                .date_naive()
                .and_hms_opt(12, 0, 0)
                .unwrap()
                .and_local_timezone(now.timezone())
                .unwrap();

            let next_noon = if now.naive_local() < today_noon.naive_local() {
                today_noon
            } else {
                today_noon + chrono::Duration::days(1)
            };

            let delay = (next_noon - now).to_std().unwrap_or(Duration::from_secs(60));
            info!("Next printer reset in {:?}", delay);
            tokio::time::sleep(delay).await;

            info!("Calling /reset_srv on printer...");
            match client.get(&url).send().await {
                Ok(resp) => info!("Printer reset response: {}", resp.status()),
                Err(e) => warn!("Printer reset failed: {}", e),
            }

            // Sleep a bit to avoid double-firing
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
    });
}

fn print_ticket<D>(printer: &mut Printer<D>, text: &str) -> Result<()>
where
    D: escpos::driver::Driver,
{
    printer.init()?;
    printer.smoothing(true)?;
    printer.writeln(text)?;
    printer.feed()?;
    printer.feed()?;
    printer.print_cut()?;

    Ok(())
}
