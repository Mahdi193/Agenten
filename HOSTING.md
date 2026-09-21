# Hosting ohne eigenen Server

Für Render liegt eine Einrichtungsvorlage in `render.yaml` bereit. Sie erstellt einen Webdienst in Frankfurt mit 512 MB RAM, einer einzelnen Instanz und 1 GB dauerhaftem Speicher für Agenten, Verläufe und Routinen. Render übernimmt HTTPS; eine eigene Domain ist nicht erforderlich.

## Kosten und Freigabe

Stand 21. September 2026: 7 USD/Monat für den Dienst plus 0,25 USD/Monat für 1 GB Speicher im Hobby-Workspace. OpenAI-Nutzung, mögliche Steuern und Mehrverbrauch kommen hinzu. Vor dem Erstellen die angezeigte Rechnung prüfen: https://render.com/pricing

Die Vorlage allein bestellt keinen Dienst. Der tatsächliche Server ist noch nicht eingerichtet oder geprüft.

## Einrichtung

1. https://dashboard.render.com/blueprint/new?repo=https://github.com/Mahdi193/Agenten öffnen und bei Render anmelden.
2. Repository `Mahdi193/Agenten`, Branch `main` und Datei `render.yaml` auswählen. Den kostenlosen Hobby-Workspace verwenden; der Webdienst selbst ist kostenpflichtig.
3. `OPENAI_API_KEY` ausschließlich im geschützten Render-Eingabefeld eintragen. `APP_TOKEN` wird automatisch erzeugt und dient als privater Zugangscode zur App.
4. Dienst, Region, dauerhaften Speicher und Kosten prüfen. Erst nach Kostenfreigabe bereitstellen.
5. Nach erfolgreichem Start die von Render angezeigte HTTPS-Adresse in der Android-App eingeben. Mit `APP_TOKEN` aus den Render-Umgebungsvariablen anmelden.
6. Verbindung testen, einen Agenten erzeugen und eine Aufgabe ausführen. Nach einem Neustart kontrollieren, ob Agent und Verlauf erhalten bleiben. Erst dann ist die Bereitstellung geprüft.

Der Dienst darf mit der lokalen SQLite-Datenbank nur eine Instanz haben. Das Volume `/app/data` nicht entfernen. Bei Deployments sind kurze Unterbrechungen möglich; bereits laufende Aufgaben werden nach Neustart als fehlgeschlagen angezeigt und können manuell erneut gestartet werden. Der kostenlose Render-Webdienst ist für diese Konfiguration ohne dauerhaften Speicher ungeeignet.

Quellen: https://render.com/docs/blueprint-spec und https://render.com/docs/disks
