# Architecture

Altyn Market starts as a modular monolith.

## Why Not Microservices For MVP

The MVP risk is operational and economic: order volume, average check, delivery cost, picking cost,
returns, and gross profit per order. Microservices and Kafka do not reduce those risks enough to
justify the complexity at launch.

## Module Boundaries

- `auth` owns phone OTP, sessions, and roles.
- `catalog` owns product/category/availability.
- `pricing` owns customer price, internal cost, and historical price snapshots.
- `cart` owns pre-order customer intent.
- `orders` owns lifecycle and final totals.
- `picking` owns assembly workflow.
- `delivery` owns courier workflow.
- `payments` owns provider-agnostic authorize/capture/refund.
- `notifications` owns SMS/push/WhatsApp dispatch.
- `admin` owns operational overrides and audit logs.
- `metrics` owns MVP reporting.

## Communication

HTTP/RPC commands and queries are the primary API. WebSocket or SSE can be added for realtime
updates, but realtime events never become the source of truth.
