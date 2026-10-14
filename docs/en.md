# Certificate Expiry

Watch the TLS certificates of your websites, NAS, router, reverse proxy or mail
server from Gladys, and be warned **before** they expire.

The integration connects to each host directly, from your Gladys machine: one
TLS handshake, the certificate is read, the connection is closed. No HTTP
request, no account, no cloud service. It works for public websites as well as
for devices on your local network.

## Setup

1. Install the integration from the Gladys store.
2. In **Configuration**, fill in the **Hosts** field, then save.
3. Open the **Discovery** tab: each host is listed as a device. Create the ones
   you want to keep in Gladys.

### The Hosts field

Hosts are separated by commas, spaces or new lines. Each entry can be:

| You type                    | Checked on                                    |
| --------------------------- | --------------------------------------------- |
| `example.com`               | `example.com`, port 443                       |
| `nas.local:5001`            | `nas.local`, port 5001                        |
| `192.168.1.1:8443`          | `192.168.1.1`, port 8443                      |
| `[fe80::1]:8443`            | IPv6 `fe80::1`, port 8443                     |
| `https://example.com/login` | `example.com`, port 443 (the path is ignored) |

An entry that is not a host is ignored; the **Check now** button lists the
ignored entries. Up to 100 hosts.

### Other settings

| Setting                       | Default | Meaning                                                                                                                                                                                                            |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Warning threshold (days)      | 30      | From this many days left, the certificate is **expiring soon**.                                                                                                                                                    |
| Critical threshold (days)     | 7       | From this many days left, it is **critical**.                                                                                                                                                                      |
| Check interval (hours)        | 12      | How often every host is checked. A check also runs at startup and when you save the configuration.                                                                                                                 |
| Connection timeout (s)        | 10      | Past this delay, the host is **unreachable**.                                                                                                                                                                      |
| Report untrusted certificates | on      | Also report a self-signed certificate, one signed by a private authority, or one that does not match the host name. Turn it off if your local devices use self-signed certificates: their expiry is still watched. |

## What you get

### One device per host

| Feature        | Content                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| Days remaining | Whole days before expiry. `0` on the last day, negative once expired. Kept in history, so you can chart it. |
| Expiry date    | Date and time of expiry, in UTC.                                                                            |
| Issuer         | Who signed the certificate (e.g. `R11` for Let's Encrypt).                                                  |

The device card also shows a **connection badge**: green when the host
answered, red when it is unreachable, with an orange dot when the certificate
is not trusted (the reason is in the tooltip).

When a host does not answer, its last values are kept and the days remaining
keep counting down from the last expiry date read: an alert is not missed
because the server was down that day.

### Configuration screen buttons

- **Check now** — checks every host and lists the result.
- **Inspect a host** — reads the certificate of any host, watched or not, and
  shows it in full: names covered, issuer, dates, trust, TLS version, SHA-256
  fingerprint. Handy before adding a host, or after renewing a certificate.

### Dashboard widget "Certificates"

Three counters (valid, expiring, problems), the certificates sorted by urgency,
and a **Check now** button. Settings per widget: number of rows shown (1 to
10), and "Only what needs attention" to hide the certificates that are fine.

### Scene triggers

Each trigger fires **once per change**, not at every check.

| Trigger                    | When                                                                      | Filters              | Variables                                                     |
| -------------------------- | ------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------- |
| A certificate is expiring  | A certificate enters the warning window, the critical window, or expires. | certificate, level   | host, level, days_remaining, expires_at, issuer               |
| A certificate was renewed  | A host presents a new certificate that runs longer than the previous one. | certificate          | host, days_remaining, expires_at, previous_expires_at, issuer |
| A certificate check failed | A host stops answering, or presents a certificate that is not trusted.    | certificate, problem | host, reason, error, message                                  |

Example: _"When a certificate is expiring, level Critical → send me a message:
`{{triggerEvent.data.host}} expires in {{triggerEvent.data.days_remaining}} days`"._

You can also use the standard **device state** trigger on the **Days
remaining** feature (for example "less than 15").

The integration remembers the last state of each certificate in its data
volume, so a restart of Gladys does not send the same alerts again.

### Scene actions

| Action                 | Result (for the next actions)                                   |
| ---------------------- | --------------------------------------------------------------- |
| Check a certificate    | `days_remaining`, `expires_at`, `level`, `reachable`, `trusted` |
| Check all certificates | `checked`, `expiring`, `problems`                               |

`level` is one of `ok`, `warning`, `critical`, `expired`, `unreachable`,
`untrusted`. A check started by a scene action never fires a trigger itself (a
scene could otherwise start itself); the next automatic check does.

## Limits

- Only direct TLS is checked (HTTPS, IMAPS 993, SMTPS 465, LDAPS 636…).
  Services that start in clear text and switch to TLS later (STARTTLS on SMTP
  587 or IMAP 143) are not supported.
- Trust is checked against the public authorities known to Node.js. A private
  authority (your own CA) shows as "not trusted": turn off **Report untrusted
  certificates** in that case.
- The days remaining and the expiry date are in UTC.

## Troubleshooting

- **Unreachable (ENOTFOUND)**: the name does not resolve from the Gladys
  machine. Try the IP address.
- **Unreachable (ETIMEDOUT / ECONNREFUSED)**: nothing answers on that port, or
  a firewall blocks it. Check the port.
- **Not trusted (DEPTH_ZERO_SELF_SIGNED_CERT, SELF_SIGNED_CERT_IN_CHAIN)**:
  self-signed certificate or private authority.
- **Not trusted (ERR_TLS_CERT_ALTNAME_INVALID)**: the certificate does not cover
  the name you typed. **Inspect a host** shows the names it covers.
- **Not trusted (UNABLE_TO_VERIFY_LEAF_SIGNATURE)**: the server does not send
  its intermediate certificate. Fix the certificate chain on the server.
