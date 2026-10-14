# Certificate Expiry

Überwache in Gladys die TLS-Zertifikate deiner Websites, deines NAS, Routers,
Reverse Proxys oder Mailservers und werde **vor** dem Ablauf gewarnt.

Die Integration verbindet sich direkt mit jedem Host, von deinem
Gladys-Rechner aus: ein TLS-Handshake, das Zertifikat wird gelesen, die
Verbindung geschlossen. Keine HTTP-Anfrage, kein Konto, kein Cloud-Dienst. Das
funktioniert für öffentliche Websites ebenso wie für Geräte in deinem lokalen
Netzwerk.

## Einrichtung

1. Installiere die Integration aus dem Gladys-Store.
2. Fülle unter **Konfiguration** das Feld **Hosts** aus und speichere.
3. Öffne den Tab **Erkennung**: Jeder Host erscheint dort als Gerät. Lege die
   an, die du in Gladys behalten willst.

### Das Feld Hosts

Hosts werden durch Kommas, Leerzeichen oder Zeilenumbrüche getrennt. Jeder
Eintrag kann sein:

| Du gibst ein                | Geprüft auf                                       |
| --------------------------- | ------------------------------------------------- |
| `beispiel.de`               | `beispiel.de`, Port 443                           |
| `nas.local:5001`            | `nas.local`, Port 5001                            |
| `192.168.1.1:8443`          | `192.168.1.1`, Port 8443                          |
| `[fe80::1]:8443`            | IPv6 `fe80::1`, Port 8443                         |
| `https://beispiel.de/login` | `beispiel.de`, Port 443 (der Pfad wird ignoriert) |

Ein Eintrag, der kein Host ist, wird ignoriert; die Schaltfläche **Jetzt
prüfen** listet die ignorierten Einträge auf. Höchstens 100 Hosts.

### Weitere Einstellungen

| Einstellung                                | Standard | Bedeutung                                                                                                                                                                                                                               |
| ------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Warnschwelle (Tage)                        | 30       | Ab so vielen verbleibenden Tagen **läuft das Zertifikat bald ab**.                                                                                                                                                                      |
| Kritische Schwelle (Tage)                  | 7        | Ab so vielen verbleibenden Tagen ist es **kritisch**.                                                                                                                                                                                   |
| Prüfintervall (Stunden)                    | 12       | Wie oft jeder Host geprüft wird. Eine Prüfung läuft auch beim Start und beim Speichern der Konfiguration.                                                                                                                               |
| Verbindungs-Timeout (s)                    | 10       | Danach gilt der Host als **nicht erreichbar**.                                                                                                                                                                                          |
| Nicht vertrauenswürdige Zertifikate melden | an       | Meldet auch ein selbstsigniertes Zertifikat, eines von einer privaten Stelle oder eines, das nicht zum Hostnamen passt. Schalte es aus, wenn deine lokalen Geräte selbstsignierte Zertifikate nutzen: ihr Ablauf wird weiter überwacht. |

## Was du bekommst

### Ein Gerät pro Host

| Funktion       | Inhalt                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Days remaining | Volle Tage bis zum Ablauf. `0` am letzten Tag, negativ nach dem Ablauf. Im Verlauf gespeichert, also als Diagramm darstellbar. |
| Expiry date    | Datum und Uhrzeit des Ablaufs, in UTC.                                                                                         |
| Issuer         | Wer das Zertifikat signiert hat (z. B. `R11` für Let's Encrypt).                                                               |

Die Gerätekarte zeigt außerdem ein **Verbindungs-Badge**: grün, wenn der Host
geantwortet hat, rot, wenn er nicht erreichbar ist, mit einem orangen Punkt,
wenn dem Zertifikat nicht vertraut wird (der Grund steht im Tooltip).

Antwortet ein Host nicht, bleiben seine letzten Werte erhalten, und die
verbleibenden Tage zählen ab dem zuletzt gelesenen Ablaufdatum weiter herunter:
Eine Warnung geht nicht verloren, nur weil der Server an dem Tag aus war.

### Schaltflächen im Konfigurationsbildschirm

- **Jetzt prüfen** — prüft alle Hosts und listet das Ergebnis auf.
- **Host untersuchen** — liest das Zertifikat eines beliebigen Hosts, überwacht
  oder nicht, und zeigt es vollständig an: abgedeckte Namen, Aussteller, Daten,
  Vertrauen, TLS-Version, SHA-256-Fingerabdruck. Praktisch vor dem Hinzufügen
  eines Hosts oder nach dem Erneuern eines Zertifikats.

### Dashboard-Widget „Zertifikate“

Drei Zähler (gültig, laufen ab, Probleme), die Zertifikate nach Dringlichkeit
sortiert und eine Schaltfläche **Jetzt prüfen**. Einstellungen pro Widget:
Anzahl der angezeigten Zeilen (1 bis 10) und „Nur was Aufmerksamkeit braucht“,
um die Zertifikate auszublenden, die in Ordnung sind.

### Szenen-Auslöser

Jeder Auslöser löst **einmal pro Änderung** aus, nicht bei jeder Prüfung.

| Auslöser                                   | Wann                                                                              | Filter              | Variablen                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------- |
| Ein Zertifikat läuft ab                    | Ein Zertifikat erreicht den Warnzeitraum, den kritischen Zeitraum oder läuft ab.  | Zertifikat, Stufe   | host, level, days_remaining, expires_at, issuer               |
| Ein Zertifikat wurde erneuert              | Ein Host zeigt ein neues Zertifikat, das länger gilt als das vorherige.           | Zertifikat          | host, days_remaining, expires_at, previous_expires_at, issuer |
| Eine Zertifikatsprüfung ist fehlgeschlagen | Ein Host antwortet nicht mehr oder zeigt ein nicht vertrauenswürdiges Zertifikat. | Zertifikat, Problem | host, reason, error, message                                  |

Beispiel: _„Wenn ein Zertifikat abläuft, Stufe Kritisch → sende mir eine
Nachricht: `{{triggerEvent.data.host}} läuft in {{triggerEvent.data.days_remaining}} Tagen ab`“._

Du kannst auch den Standard-Auslöser **Gerätezustand** auf der Funktion **Days
remaining** verwenden (zum Beispiel „kleiner als 15“).

Die Integration merkt sich den letzten Zustand jedes Zertifikats in ihrem
Datenvolume, damit ein Neustart von Gladys nicht dieselben Warnungen erneut
sendet.

### Szenen-Aktionen

| Aktion                  | Ergebnis (für die nächsten Aktionen)                            |
| ----------------------- | --------------------------------------------------------------- |
| Zertifikat prüfen       | `days_remaining`, `expires_at`, `level`, `reachable`, `trusted` |
| Alle Zertifikate prüfen | `checked`, `expiring`, `problems`                               |

`level` ist einer der Werte `ok`, `warning`, `critical`, `expired`,
`unreachable`, `untrusted`. Eine von einer Szenen-Aktion gestartete Prüfung
löst selbst nie einen Auslöser aus (eine Szene könnte sich sonst selbst
starten); die nächste automatische Prüfung tut es.

## Grenzen

- Nur direktes TLS wird geprüft (HTTPS, IMAPS 993, SMTPS 465, LDAPS 636…).
  Dienste, die im Klartext beginnen und später zu TLS wechseln (STARTTLS auf
  SMTP 587 oder IMAP 143), werden nicht unterstützt.
- Das Vertrauen wird gegen die öffentlichen Stellen geprüft, die Node.js kennt.
  Eine private Stelle (deine eigene CA) erscheint als „nicht
  vertrauenswürdig“: Schalte in dem Fall **Nicht vertrauenswürdige Zertifikate
  melden** aus.
- Die verbleibenden Tage und das Ablaufdatum sind in UTC.

## Fehlerbehebung

- **Nicht erreichbar (ENOTFOUND)**: Der Name lässt sich vom Gladys-Rechner aus
  nicht auflösen. Versuche es mit der IP-Adresse.
- **Nicht erreichbar (ETIMEDOUT / ECONNREFUSED)**: Auf diesem Port antwortet
  nichts, oder eine Firewall blockiert ihn. Prüfe den Port.
- **Nicht vertrauenswürdig (DEPTH_ZERO_SELF_SIGNED_CERT,
  SELF_SIGNED_CERT_IN_CHAIN)**: selbstsigniertes Zertifikat oder private
  Stelle.
- **Nicht vertrauenswürdig (ERR_TLS_CERT_ALTNAME_INVALID)**: Das Zertifikat
  deckt den eingegebenen Namen nicht ab. **Host untersuchen** zeigt die Namen,
  die es abdeckt.
- **Nicht vertrauenswürdig (UNABLE_TO_VERIFY_LEAF_SIGNATURE)**: Der Server sendet
  sein Zwischenzertifikat nicht. Korrigiere die Zertifikatskette auf dem
  Server.
