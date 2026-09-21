# Prüfbericht – Agentenwerk 0.1

Stand: 21. September 2026.

## Erfolgreich geprüft

- Android-Debug-APK gebaut: Android Gradle Plugin 8.9.2, Gradle 8.11.1, SDK 35, Java 21.
- APK-Signatur mit dem Android-Werkzeug `apksigner` verifiziert (v2).
- Paket: `de.agentenwerk.app.preview`, Version `0.1.0-preview`, Mindest-API 26 (Android 8.0), Ziel-API 35.
- Gradle-Wrapper erzeugt und mitgeliefert.
- JavaScript-Syntaxprüfung erfolgreich.
- Acht automatisierte Tests bestanden:
  1. Anmeldung, Cookie-Eigenschaften, ungültige Eingaben und Abwehr fremder Website-Aufrufe.
  2. Profilerstellung, Aufgabenbearbeitung, Verlauf und Bearbeiten eines Agenten ohne Datenverlust.
  3. Aufgabenabbruch und Schutz vor Löschen eines noch arbeitenden Agenten.
  4. Tageslimit, Routinevalidierung und Pausieren.
  5. OpenAI-Anfrageformat, serverseitige Schlüsselverwendung und Quellenverarbeitung mit Testantworten.
  6. Fehlerbehandlung bei fehlendem Schlüssel und unvollständiger OpenAI-Antwort.
  7. Fällige Routine genau einmal starten, nächsten Termin setzen und Daten nach Server-Neustart erhalten.
  8. Verschiedene Agenten parallel ausführen, Aufgaben desselben Agenten nacheinander.
- Browserprüfung in Desktop- und Smartphonebreite (390 × 844): Profil aus Beschreibung erzeugen, bearbeiten und speichern; Aufgabe starten und Ergebnis sehen; Ergebnis an einen zweiten Agenten weitergeben; Routine anlegen und pausieren.
- Keine horizontalen Überläufe in der geprüften Smartphoneansicht. Keine Browserfehler während des geprüften Ablaufs.

## Nicht geprüft / nicht bereitgestellt

- Keine echte OpenAI-Anfrage: Es lag kein eingerichteter API-Zugang vor. Die Browserabläufe wurden im ausdrücklich gekennzeichneten Demomodus geprüft; die API-Tests verwenden Testantworten.
- APK noch nicht auf physischem Android-Gerät oder Emulator gestartet.
- Kein öffentlicher Server, keine Domain und kein Hosting eingerichtet.
- Kein Cloud-Computer und keine Steuerung fremder Apps integriert.
- Kein Lasttest, unabhängiges Sicherheitsaudit oder Play-Store-Release.

Die Debug-APK ist für die Erprobung gedacht. Die Startanleitung beschreibt den lokalen Test sowie die noch nötige Einrichtung für echte KI-Aufgaben.

## Nachtrag 0.2

Simulierte Ausführung entfernt, Cloud-Container und HTTPS-Proxy vorbereitet, echter Verbindungstest ergänzt. Neun automatisierte Tests bestanden. Cloud-Deployment, reale API-Ausführung und Gerätetest weiterhin ausstehend. Frühere Demo-Prüfungen sind keine Live-Nachweise.

## Erfolgreicher Live-Test am 21. September 2026

Der inzwischen eingerichtete API-Zugang wurde mit echten OpenAI-Anfragen geprüft. Ein Verbindungstest mit `chat-latest` war erfolgreich. Über die HTTP-Schnittstelle der App wurde ein Agentenprofil erzeugt und gespeichert, danach eine Aufgabe in die Warteschlange gestellt und durch OpenAI bearbeitet. Der Lauf erreichte `done`; die Antwort auf 17 × 23 war korrekt `391`. Die Testdaten lagen nur in einer temporären In-Memory-Datenbank.

Der frühere Demo-Prozess wurde beendet und der reguläre lokale Server gestartet. Cloud-Bereitstellung, echte Websuche und mobiler Gerätetest stehen weiterhin aus.

## GitHub-Bereitstellung am 21. September 2026

Der Quellcode wurde ohne lokale Zugangsdaten und Datenbanken im Repository [Mahdi193/Agenten](https://github.com/Mahdi193/Agenten) veröffentlicht. [Workflow 35589277973](https://github.com/Mahdi193/Agenten/actions/runs/35589277973) hat beide Jobs erfolgreich abgeschlossen: Servertests und Android-Build. Die Debug-APK steht als Artefakt Agentenwerk-Android bereit (Aufbewahrung: 30 Tage). GitHub betreibt den Agentenserver nicht.
