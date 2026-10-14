# Security policy

## Supported versions

Only the latest release of the Certificate Expiry integration receives security
fixes. Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue, pull request or forum post for a
security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-certificatexpiry](https://github.com/prohand/gladys-certificatexpiry/security),
then **Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove host names, addresses and tokens first).

You should get a first answer within 7 days. A fix is released as a new version
of the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)),
and the servers whose certificates the integration reads.

## How the integration treats the hosts it checks

- It opens one TLS connection per host, reads the certificate and closes the
  connection: no HTTP request, no credential sent, nothing written to the host.
- It accepts any certificate during that handshake on purpose (an expired or
  self-signed certificate is what it reports), and never sends data over such
  a connection.
- Credentials pasted inside a URL (`https://user:password@host`) are dropped
  when the host list is read, and never logged.
- It writes only under `/data` (the last known state of each certificate), and
  runs as a non-root user in a read-only container.

## Good practices for users

- Keep Gladys and the integration up to date.
- List only hosts you own or are allowed to check.
