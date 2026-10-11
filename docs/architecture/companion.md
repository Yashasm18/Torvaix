# Torvaix Companion Layer (Experimental)

The **Torvaix Companion Layer** is a lightweight, strictly isolated infrastructure built to bridge your local workspace with trusted secondary devices (such as a mobile phone or secondary laptop) without sacrificing local-first security.

It uses **SQLite** for local persistence. The agent server listens only on `127.0.0.1` by default, so another device cannot reach these endpoints until you deliberately open the agent to your network with `AGENT_HOST` and `AGENT_ALLOWED_HOSTS`. Read [SECURITY.md](../../SECURITY.md) first: the agent has no login.

> [!WARNING]
> This feature is experimental. It is designed for secure, trusted LAN environments. Exposing your Torvaix instance to the public internet without an HTTPS proxy and strict firewall rules is highly discouraged.

---

## The Companion Architecture

The Companion Layer is intentionally decoupled from Torvaix's core agent orchestration. It provides:
1. **Device Pairing**: Secure, time-bound registration of external devices.
2. **Session Continuity**: Long-lived session management for previously trusted devices.
3. **Scopes**: A `readonly` or `admin` label recorded per device. **Scopes are not enforced yet** (see below).

### Storage & Persistence
All companion data is stored locally in your SQLite database (`~/.torvaix/data/torvaix.db`). No external servers or temporary memory caches are used. If you restart Torvaix, your paired devices and active sessions seamlessly persist.

---

## The Pairing Protocol

To establish trust between your Torvaix host and a companion device, we use a strictly timed, one-time pairing protocol.

### 1. Token Generation (Host)
The host generates a highly entropic, one-time use pairing token.
* **Endpoint**: `POST /api/companion/pair/create`
* **Expiry**: 10 minutes by default. `expiryMinutes` in the request can set it from 1 to 60.
* **Scope**: Defaults to `readonly`. Can be elevated to `admin`.

### 2. Device Claiming (Companion)
The companion device submits the pairing token along with its unique device fingerprint.
* **Endpoint**: `POST /api/companion/pair/claim`
* **Mechanism**: If the token is valid, unexpired, and unclaimed, Torvaix registers the device fingerprint and issues a long-lived Session Token.
* **Prevention**: The pairing token is immediately marked as claimed. Replay attacks are impossible.

### 3. Session Continuity
Once paired, the device uses its Session Token to authenticate. 
* **Endpoint**: `POST /api/companion/session/validate`
* **Lifecycle**: A session lasts 24 hours. To get a new one, call `POST /api/companion/session` with the `deviceId` **and the current, unexpired `sessionToken`**. A device ID alone is not enough, and a revoked or expired device has to pair again.

---

## Trust & Revocation

The Companion Layer operates on a **Trust but Verify** model.

* **Fingerprint Uniqueness**: Every companion device must present a unique fingerprint. If a compromised fingerprint attempts to re-pair, the system handles it gracefully based on the existing record.
* **Scopes are recorded but not enforced.** `session/validate` reports the capabilities a scope is meant to have, but no other endpoint checks a session or its scope. Requests without a token already run as the default local user, so a `readonly` device can call everything an `admin` one can, including running the agent. Do not rely on scopes to limit a device.
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
