curl -s -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/demo-baudouin-h3/databases/(default)/documents" -o /dev/null -w "firestore %{http_code}\n"
curl -s -X DELETE "http://127.0.0.1:9099/emulator/v1/projects/demo-baudouin-h3/accounts" -o /dev/null -w "auth %{http_code}\n"
