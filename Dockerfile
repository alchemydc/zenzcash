FROM rust:1-slim-bookworm@sha256:24707e70a4f1e23d9a7b25202ec43126d28a52294b96aad5c670df1fd1f1d400 AS rust-build
RUN apt-get update && apt-get install -y --no-install-recommends libssl-dev pkg-config && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY server server
RUN cargo build --locked --release --manifest-path server/Cargo.toml
RUN cargo build --locked --release --manifest-path server/webauthn/Cargo.toml

FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl libssl3 util-linux tar && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 zforum && useradd --uid 10001 --gid zforum --no-create-home zforum
WORKDIR /app
COPY site site
COPY tools tools
COPY model model
COPY scripts/zforum scripts/container-entrypoint.sh scripts/production-import scripts/
COPY --from=rust-build /build/server/target/release/zforum-server server/target/release/zforum-server
COPY --from=rust-build /build/server/webauthn/target/release/zforum-webauthn server/webauthn/target/release/zforum-webauthn
RUN node tools/build-runtime.mjs && node tools/smoke-runtime.mjs && ln -s /data/work /app/work && chmod 755 scripts/*
ENV NODE_ENV=production
EXPOSE 8080
ENTRYPOINT ["/app/scripts/container-entrypoint.sh"]
CMD ["node", "tools/production.mjs"]
