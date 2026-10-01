FROM rust:1.95-bookworm AS builder
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home api
WORKDIR /app
COPY --from=builder /build/target/release/mis-finanzas-api /app/mis-finanzas-api
USER api
ENV PORT=8080
EXPOSE 8080
CMD ["/app/mis-finanzas-api"]
