FROM rust:1.91-bookworm AS builder

WORKDIR /build

# copy manifests
COPY Cargo.toml Cargo.lock ./
COPY api/Cargo.toml ./api/
COPY lexicon/Cargo.toml ./lexicon/

# copy source
COPY api/src ./api/src
COPY api/migrations ./api/migrations
COPY public ./public
COPY lexicon/src ./lexicon/src
# and /.sqlx
COPY .sqlx .sqlx

# build release binary
RUN cargo build --release --package teal-wrapped-api

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# copy binary from builder
COPY --from=builder /build/target/release/teal-wrapped-api /app/server

EXPOSE 3001

CMD ["/app/server"]
