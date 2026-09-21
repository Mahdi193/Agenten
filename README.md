# Agentenwerk

Android-Client und privater Agentenserver mit echter OpenAI-Anbindung. Eigenständiges Projekt, kein offizielles Produkt von OpenAI oder xAI.

## Aktueller Funktionsumfang

- KI-generierte, bearbeitbare Agentenprofile
- Aufgabenbearbeitung mit OpenAI Responses API und optionaler Websuche
- Persistente Verläufe und ausdrücklich gespeicherte Präferenzen
- Parallele Agenten, Aufgabenabbruch und manuelle Ergebnisübergabe
- Wiederkehrende Aufgaben auf dem laufenden Server

**Kein vollständiger Grok-Bot-Ersatz:** Cloud-Computer, Steuerung fremder Apps, autonome Delegation, Datei-Uploads und Push-Mitteilungen sind noch nicht implementiert.

## Android auf GitHub bauen

Der Workflow unter `.github/workflows/build.yml` führt zuerst die Servertests aus und erstellt danach eine installierbare Debug-APK. Unter **Actions → Test and build Android → Artifacts → Agentenwerk-Android** herunterladen. Der Build benötigt keinen API-Schlüssel. GitHub Actions wurde lokal vorbereitet, aber noch nicht im Ziel-Repository ausgeführt.

Die APK ist derzeit ein Client: Bei der Einrichtung muss sie sich mit dem laufenden Server verbinden. Das Hochladen des Projekts zu GitHub stellt diesen Server noch nicht bereit. GitHub Pages kann ihn nicht ausführen.

## Echter Betrieb

Siehe [START-HIER.md](START-HIER.md). Lokal mit Node.js 24 und `npm start`; für Cloud-Betrieb sind Docker Compose und ein HTTPS-Proxy vorbereitet. `.env` enthält die privaten Zugangsdaten und gehört niemals in Git. Auch nicht in ein privates Repository oder in die APK.

## Validierung

Neun automatisierte Tests bestanden. Echte OpenAI-Verbindung, Erzeugung eines Agentenprofils und Bearbeitung einer einfachen Aufgabe wurden am 21. September 2026 erfolgreich geprüft. Der Agent lieferte für 17 × 23 das erwartete Ergebnis 391. Android-Build und APK-Signatur wurden geprüft; Gerätetest, GitHub-Build und dauerhafte Cloud-Bereitstellung stehen noch aus.

```text
npm test
cd android
gradlew.bat assembleDebug
```
