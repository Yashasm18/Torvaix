# Torvaix Companion Layer (Experimental)

The **Torvaix Companion Layer** is a lightweight, strictly isolated infrastructure built to bridge your local workspace with trusted secondary devices (such as a mobile phone or secondary laptop) without sacrificing local-first security.

It operates entirely on your local network (LAN) and uses **SQLite** for zero-dependency local persistence. 

> [!WARNING]
> This feature is experimental. It is designed for secure, trusted LAN environments. Exposing your Torvaix instance to the public internet without an HTTPS proxy and strict firewall rules is highly discouraged.

---

## The Companion Architecture

The Companion Layer is intentionally decoupled from Torvaix's core agent orchestration. It provides:
1. **Device Pairing**: Secure, time-bound registration of external devices.
2. **Session Continuity**: Long-lived session management for previously trusted devices.
3. **Scope Isolation**: Explicit capabilities (`readonly` vs `admin`) assigned per device.

### Storage & Persistence
All companion data is stored locally in your SQLite database (`torvaix_metadata.db`). No external servers or temporary memory caches are used. If you restart Torvaix, your paired devices and active sessions seamlessly persist.

---

## The Pairing Protocol

To establish trust between your Torvaix host and a companion device, we use a strictly timed, one-time pairing protocol.

### 1. Token Generation (Host)
The host generates a highly entropic, one-time use pairing token.
* **Endpoint**: `POST /api/companion/pair/create`
* **Expiry**: Hardcoded to a maximum of 10 minutes.
* **Scope**: Defaults to `readonly`. Can be elevated to `admin`.

### 2. Device Claiming (Companion)
The companion device submits the pairing token along with its unique device fingerprint.
* **Endpoint**: `POST /api/companion/pair/claim`
* **Mechanism**: If the token is valid, unexpired, and unclaimed, Torvaix registers the device fingerprint and issues a long-lived Session Token.
* **Prevention**: The pairing token is immediately marked as claimed. Replay attacks are impossible.

### 3. Session Continuity
Once paired, the device uses its Session Token to authenticate. 
* **Endpoint**: `POST /api/companion/session/validate`
* **Lifecycle**: Sessions naturally expire (e.g., 24 hours) but can be refreshed by submitting the device ID (assuming the device hasn't been revoked).

---

## Trust & Revocation

The Companion Layer operates on a **Trust but Verify** model.

* **Fingerprint Uniqueness**: Every companion device must present a unique fingerprint. If a compromised fingerprint attempts to re-pair, the system handles it gracefully based on the existing record.
* **Scope Limits**: 
  * `readonly`: Permitted to read memory and view workspaces. Cannot invoke execution agents or tools.
  * `admin`: Full access to the Torvaix orchestration layer.
* **Manual Revocation**: At any time, you can instantly sever trust.
  * **Endpoint**: `POST /api/companion/devices/revoke`
  * **Result**: The device's session token is wiped, the `revoked` flag is flipped to `1`, and all future validation requests immediately fail.

---

## Future Roadmap for Companion

While currently an experimental internal API, the Companion Layer paves the way for:
* Dedicated mobile companion apps.
* Seamless remote handoff (start a task on your laptop, review the agent's progress on your phone).
* Read-only public share links for specific memory nodes.

*Your data. Your network. Your rules.*
