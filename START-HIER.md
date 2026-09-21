# Agentenwerk 0.2 – echter API-Betrieb

Der simulierte Ausführungspfad wurde entfernt. Es gibt keine vorgefertigten KI-Antworten und keinen automatischen Ersatz bei API-Fehlern. Die Produktionsanwendung startet nur mit OPENAI_API_KEY und einem sicheren APP_TOKEN.

## Aktueller Stand

Die Android-App benötigt einen erreichbaren Agentenwerk-Server. Der echte API-Test und der GitHub-Build waren erfolgreich. Für die Cloud-Bereitstellung fehlen noch Serveradresse und Zugang. Diese Fassung ist nicht als vollständig geprüfter Grok-Bot-Ersatz freigegeben.

Umgesetzt: Agentenprofile, echte Responses-API-Anfragen, Websuche, gespeicherte Präferenzen, Aufgabenverlauf, parallele Agenten, Aufgabenabbruch, manuelle Ergebnisübergaben und Routinen.

Noch nicht umgesetzt: Cloud-Computer mit Browser-Fernsteuerung, fremde App-Anmeldungen und App-Steuerung, autonome Delegation, Lernen durch Zuschauen, Datei-Uploads, Sprache und Push-Mitteilungen.

## Cloud-Bereitstellung

Voraussetzungen: Linux-Server mit Docker und Compose, App-Domain mit DNS-Verweis auf den Server, freie Ports 80 und 443. Bereits laufende Webdienste nicht ersetzen; bei vorhandener Infrastruktur den Proxy passend integrieren.

1. Quellcode auf den Server übertragen, ohne lokale Datenbanken und ohne automatisch Geheimnisse mitzupacken.
2. Dort .env.example nach .env kopieren; OPENAI_API_KEY, APP_TOKEN und DOMAIN setzen. APP_TOKEN muss mindestens 24 Zeichen haben. Empfehlung: 32 zufällige Bytes als Hex-Zeichenfolge. Der API-Schlüssel wird nicht in die Android-App eingebaut.
3. OPENAI_MODEL auf ein verfügbares Modell mit Responses API, Structured Outputs und gegebenenfalls Websuche setzen. Voreinstellung: chat-latest.
4. Im Projektordner docker compose up -d --build ausführen. Caddy stellt bei korrektem DNS HTTPS bereit. Die API ist nicht direkt als öffentlicher Port freigegeben. SQLite liegt in einem persistenten Volume.
5. In der Android-App die HTTPS-Domain eingeben und mit APP_TOKEN anmelden.
6. Unter Verbindung den echten OpenAI-Verbindungstest durchführen. Anschließend Profilerstellung, eine Aufgabe, Quellen und eine Routine mit echtem API-Zugriff prüfen.

Die echten Anfragen und Websuchen verursachen API-Kosten. Ein Tageslimit von 60 Aufträgen/Profilerstellungen/Verbindungstests (UTC) ist voreingestellt; es ist kein Geldlimit.

## Lokaler Serverbetrieb

Mit Node.js 24: .env befüllen, dann npm start. Standardadresse: http://127.0.0.1:8787. Es gibt keinen Demostart mehr. Der lokale Server ist nur bei laufendem Prozess erreichbar.

Der Android-Debug-Client kann per adb reverse tcp:8787 tcp:8787 über USB auf diesen Server zugreifen. Auf dem Handy http://127.0.0.1:8787 verwenden, im Emulator http://10.0.2.2:8787. Regulärer Zugriff erfordert HTTPS.

## Daten und Ausführung

Routinen starten erstmals nach 1, 24 oder 168 Stunden, nicht zu einer festen lokalen Uhrzeit. Verpasste Intervalle werden höchstens einmal nachgeholt. Der Server muss laufen. Unterbrochene Aufgaben werden nach Neustart als fehlgeschlagen markiert; kein automatischer erneuter API-Aufruf. Bereits angefallene Kosten werden durch einen Abbruch nicht rückgängig gemacht.

Die letzten fünf abgeschlossenen Aufgaben fließen gekürzt in neue Aufträge ein. Explizite Präferenzen bleiben gespeichert. Die Datenbank ist nicht auf Anwendungsebene verschlüsselt: Datenträger, Zugriff und Backups auf dem Server schützen. Die Anwendung ist für einen privaten Einzelbenutzer-Arbeitsraum und einen Serverprozess ausgelegt.

## Validierung

Neun automatisierte Tests bestehen; sie nutzen gezielte Testantworten statt kostenpflichtiger echter API-Aufrufe. Android 0.1 wurde gebaut und die APK-Signatur geprüft. Die Android-Hülle lädt die aktuelle Oberfläche vom Server. Echte API-Verbindung, Profilerstellung und Aufgabenausführung sowie der GitHub-Build wurden erfolgreich geprüft. Ein physischer Android-Test und Cloud-Deployment sind noch offen. Der ältere Browserprüfbericht beschreibt ausdrücklich die frühere Vorschau.

Servertests: npm test. Android-Build: im Ordner android gradlew.bat assembleDebug. Die APK-Datei bleibt als Debug-Vorschau gekennzeichnet, bis die tatsächliche Bereitstellung und Gerätetests abgeschlossen sind.
