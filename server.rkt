#lang minimart
;; Generic broker for WebSockets-based minimart/marketplace communication.

(require net/rfc6455)
(require minimart/drivers/timer)
(require minimart/drivers/websocket)
(require minimart/demand-matcher)
(require minimart/pattern)
(require json)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Main: start WebSocket server

(log-events-and-actions? #f)

(define ping-interval (* 1000 (max (- (ws-idle-timeout) 10) (* (ws-idle-timeout) 0.8))))

(spawn-timer-driver)
(spawn-websocket-driver)

(define (spawn-server-listener port ssl-options)
  (define server-id (websocket-server port ssl-options))
  (spawn-demand-matcher (websocket-message (websocket-remote-client ?) server-id ?)
			#:meta-level 1
			#:demand-is-subscription? #f
			(match-lambda ;; arrived-demand-route, i.e. new connection publisher
			 [(route _ (websocket-message c _ _) 1 _)
			  (spawn-connection-handler c server-id)]
			 [_ '()])))

(spawn-world
 (spawn-server-listener 8000 #f)
 (spawn-server-listener 8443 (websocket-ssl-options "server-cert.pem" "private-key.pem")))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Wire protocol representation of events and actions

(define (drop-json-pattern p)
  (pattern-subst p (hasheq '__ "__") ?))

(define (drop-json-route r)
  (match r
    [`(,pub-or-sub ,pattern ,meta-level ,level)
     (route (match pub-or-sub ["sub" #t] ["pub" #f])
	    (drop-json-pattern pattern)
	    meta-level
	    level)]))

(define (drop-json-action j)
  (match j
    ["ping" 'ping]
    ["pong" 'pong]
    [`("routes" ,routes) (routing-update (map drop-json-route routes))]
    [`("message" ,body ,meta-level ,feedback?) (message body meta-level feedback?)]))

(define (lift-json-pattern p)
  (pattern-subst p ? (hasheq '__ "__")))

(define (lift-json-route r)
  (match r
    [(route sub? p ml l) `(,(if sub? "sub" "pub") ,(lift-json-pattern p) ,ml ,l)]))

(define (lift-json-event j)
  (match j
    ['ping "ping"]
    ['pong "pong"]
    [(routing-update rs) `("routes" ,(map lift-json-route rs))]
    [(message body meta-level feedback?) `("message" ,body ,meta-level ,feedback?)]))

(require racket/trace)
(trace drop-json-action)
(trace lift-json-event)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Connections

(struct connection-state (client-id tunnelled-routes) #:transparent)

(define (spawn-connection-handler c server-id)
  (define (send-event e s)
    (send (websocket-message server-id
			     (connection-state-client-id s)
			     (jsexpr->string (lift-json-event e)))
	  #:meta-level 1))
  (define ((handle-connection-routing-change rs) s)
    (match rs
      ['() (transition s (quit))] ;; websocket connection closed
      [_ (transition s '())]))
  (define ((handle-tunnelled-routing-change rs) s)
    (transition s (send-event (routing-update rs) s)))
  (define ((handle-tunnellable-message m) s)
    (if (ormap (lambda (r) (route-accepts? r m)) (connection-state-tunnelled-routes s))
	(transition s (send-event m s))
	(transition s '())))
  (define relay-connections
    (list (sub (timer-expired c ?) #:meta-level 1)
	  (sub (websocket-message c server-id ?) #:meta-level 1)
	  (sub (websocket-message c server-id ?) #:meta-level 1 #:level 1)
	  (pub (websocket-message server-id c ?) #:meta-level 1)))
  (define (connection-handler e s)
    (match e
      [(routing-update rs)
       (sequence-transitions
	(transition s '())
	(handle-connection-routing-change (intersect-routes rs relay-connections))
	(handle-tunnelled-routing-change
	 (intersect-routes rs (connection-state-tunnelled-routes s))))]
      [(? message? m)
       (sequence-transitions
	(match m
	  [(message (websocket-message from to data) 1 #f)
	   (match (drop-json-action (string->jsexpr data))
	     [(routing-update rs-unfiltered)
	      (define rs (filter (lambda (r) (zero? (route-meta-level r))) rs-unfiltered))
	      (transition (struct-copy connection-state s [tunnelled-routes rs])
			  (routing-update (append rs relay-connections)))]
	     [(? message? m)
	      (transition s (if (zero? (message-meta-level m)) m '()))]
	     ['ping
	      (transition s (send-event 'pong s))]
	     ['pong
	      (transition s '())])]
	  [(message (timer-expired _ _) 1 #f)
	   (transition s (list (send (set-timer c ping-interval 'relative) #:meta-level 1)
			       (send-event 'ping s)))]
	  [_
	   (transition s '())])
	(handle-tunnellable-message m))]
      [#f #f]))
  (list (send (set-timer c ping-interval 'relative) #:meta-level 1)
	(spawn connection-handler
	       (connection-state c '())
	       relay-connections)))
