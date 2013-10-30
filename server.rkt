#lang minimart

(require net/rfc6455)
(require minimart/drivers/websocket)
(require minimart/demand-matcher)
(require minimart/pattern)
(require json)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Main: start WebSocket server

;; (ws-idle-timeout 3) ;; TODO: deal with reconnects, and then remove
(log-events-and-actions? #f)

(spawn-websocket-driver)

(define any-client (websocket-remote-client ?))
(define server-id (websocket-server 8000))

(spawn-world
 (spawn-demand-matcher (websocket-message any-client server-id ?)
		       #:meta-level 1
		       #:demand-is-subscription? #f
		       (match-lambda ;; arrived-demand-route, i.e. new connection publisher
			[(route _ (websocket-message c _ _) 1 _)
			 (spawn-connection-handler c)]
			[_ '()])))

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
    [`("routes" ,routes) (routing-update (map drop-json-route routes))]
    [`("message" ,body ,meta-level ,feedback?) (message body meta-level feedback?)]))

(define (lift-json-pattern p)
  (pattern-subst p ? (hasheq '__ "__")))

(define (lift-json-route r)
  (match r
    [(route sub? p ml l) `(,(if sub? "sub" "pub") ,(lift-json-pattern p) ,ml ,l)]))

(define (lift-json-event j)
  (match j
    [(routing-update rs) `("routes" ,(map lift-json-route rs))]
    [(message body meta-level feedback?) `("message" ,body ,meta-level ,feedback?)]))

(require racket/trace)
(trace drop-json-action)
(trace lift-json-event)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Connections

(struct connection-state (client-id tunnelled-routes) #:transparent)

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

(define (spawn-connection-handler c)
  (define relay-connections
    (list (sub (websocket-message c server-id ?) #:meta-level 1)
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
      [(and wsm (message (websocket-message from to data) 1 #f))
       (sequence-transitions
	(match (drop-json-action (string->jsexpr data))
	  [(routing-update rs)
	   (transition (struct-copy connection-state s [tunnelled-routes rs])
		       (routing-update (append rs relay-connections)))]
	  [(? message? m)
	   (transition s m)])
	(handle-tunnellable-message wsm))]
      [(? message? m)
       ((handle-tunnellable-message m) s)]
      [#f #f]))
  (spawn connection-handler
	 (connection-state c '())
	 relay-connections))
