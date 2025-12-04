use teal_wrapped_api::run;

#[tokio::main]
async fn main() {
    // env vars
    dotenvy::dotenv().ok();
    run().await;
}
