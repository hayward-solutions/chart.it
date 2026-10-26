# syntax=docker/dockerfile:1.7

FROM node:26-alpine AS web

WORKDIR /web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

FROM golang:1.27-alpine AS build

ARG VERSION=dev
ARG TARGETARCH

WORKDIR /src

RUN apk add --no-cache ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal
COPY templates ./templates
COPY --from=web /web/dist ./internal/ui/dist

RUN touch internal/ui/dist/.keep \
    && CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build \
        -trimpath \
        -ldflags "-s -w -X main.version=${VERSION}" \
        -o /out/chartit ./cmd/chartit

RUN mkdir -p /data && chown -R 65532:65532 /data

FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app

COPY --from=build /out/chartit /app/chartit
COPY --from=build --chown=65532:65532 /data /data

ENV CHARTIT_ADDR=:8080 \
    CHARTIT_DATA_DIR=/data

EXPOSE 8080
USER nonroot:nonroot
VOLUME ["/data"]

ENTRYPOINT ["/app/chartit"]
