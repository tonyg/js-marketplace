#lang minimart
;; Generic broker for WebSockets-based minimart/marketplace communication.

(require minimart/drivers/timer)
(require minimart/drivers/websocket)
(require minimart/relay)

(spawn-timer-driver)
(spawn-websocket-driver)
(spawn-world
 (spawn-websocket-relay 8000)
 (spawn-websocket-relay 8443 (websocket-ssl-options "server-cert.pem" "private-key.pem")))
