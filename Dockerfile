FROM rust:1.83-bookworm AS builder

WORKDIR /build

# copy manifests
COPY Cargo.toml Cargo.lock ./
COPY api/Cargo.toml ./api/
COPY lexicon/Cargo.toml ./lexicon/

# copy source
COPY api/src ./api/src
COPY lexicon/src ./lexicon/src

# build release binary
RUN cargo build --release --package teal-wrapped-api

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# copy binary from builder
COPY --from=builder /build/target/release/teal-wrapped-api /app/server

EXPOSE 3001

CMD ["/app/server"]
