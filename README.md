# JS-Marketplace: a Network Calculus Implementation

Currently just a prototype.

Some of the examples are standalone (e.g. the textfield example); some
require a Racket server (e.g. the chat example).

To install the Racket server:

 - download a [recent Racket](http://racket-lang.org/download/) (e.g. 5.93)
 - when Racket is installed, install the `rfc6455` and `minimart` packages:
    - `raco pkg install rfc6455`
    - `raco pkg install minimart`

To run the Racket server:

 - `racket server.rkt` from the base directory of this repository.

The Racket server listens for tunnelled Network Calculus events via
websocket on ports 8000 (HTTP) and 8443 (HTTPS, if you have a
certificate available).

Note that if you *don't* have a certificate available, then you will
see complaints from the Racket server as it starts. These end up just
being warnings, despite the severity of their appearance; the server
should function normally on port 8000.
